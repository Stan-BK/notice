import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Notice } from './handleNotices';
import { NoticeType, VapidKeys } from './enums';
import { pushNotification } from './subscription';
import { PushSubscription } from 'web-push';
dayjs.extend(utc);

export async function pollSchedule(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
	const time = getTimeWithZone(event.scheduledTime);
	const KV = env['Notice-Book'];
	const keys = await KV.list();
	const needToNotice: {
		endPoint: string;
		notices: Notice[];
	}[] = [];
	for (const key of keys.keys) {
		if (key.name.startsWith(`notice_${NoticeType.Today}`)) {
			needToNotice.push({
				endPoint: key.name.replace(`notice_${NoticeType.Today}_`, ''),
				notices: (await KV.get(key.name, 'json'))!,
			});
		}
	}
	let needNotifications = [];
	for (const { endPoint, notices } of needToNotice) {
		for (const notice of notices) {
			if (notice.hour == time.get('hour') && notice.minute == time.get('minute')) {
				needNotifications.push(
					pushNotification(JSON.parse((await KV.get(`subscription_${endPoint}`))!) as PushSubscription, notice, {
						subject: env.SUBSCRIPTION_PATH,
						publicKey: (await KV.get(`${VapidKeys.PublicKey}_${endPoint}`))!,
						privateKey: (await KV.get(`${VapidKeys.PrivateKey}_${endPoint}`))!,
					})
				);
			}
		}
	}
	await Promise.allSettled(needNotifications).catch(() => {});
}

export async function updateDailySchedule(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
	const time = getTimeWithZone(event.scheduledTime);
	if (time.get('hour') != 0 && time.get('minute') != 0) return;

	const KV = env['Notice-Book'];
	const keys = await KV.list();
	const noticeListMap: Record<NoticeType, Map<string, Notice[]>> = {
		[NoticeType.All]: new Map(),
		[NoticeType.Yesterday]: new Map(),
		[NoticeType.Today]: new Map(),
		[NoticeType.Tomorrow]: new Map(),
	};
	const kvs = Object.values(noticeListMap);
	const nameSet = new Set();

	for (const key of keys.keys) {
		if (key.name.startsWith(`notice_`)) {
			const type = key.name.split('_')[1] as NoticeType;

			nameSet.add(key.name);
			noticeListMap[type].set(key.name, (await KV.get(key.name, 'json'))!);
		}
	}

	const needToSynchronize: Promise<void>[] = [];

	for (let i = 1; i < kvs.length; i++) {
		const noticeList = kvs[i];
		switch (i) {
			case 1:
				noticeList.forEach((notices, key) =>
					needToSynchronize.push(
						(async () => {
							const lastType = getLastType(key);
							const lastTypeNotices = await KV.get(lastType).then((value) => {
								if (value) {
									return JSON.parse(value) as Notice[];
								}
							});
							await KV.put(lastType, JSON.stringify(lastTypeNotices ? lastTypeNotices?.concat(notices) : notices));
							if (!nameSet.has(getNextType(key))) {
								await KV.delete(key);
							}
						})()
					)
				);
				break;
			case 2:
				noticeList.forEach((notices, key) =>
					needToSynchronize.push(
						(async () => {
							const lastType = getLastType(key);
							await KV.put(lastType, JSON.stringify(notices));
							if (!nameSet.has(getNextType(key))) {
								await KV.delete(key);
							}
						})()
					)
				);
				break;
			case 3:
				noticeList.forEach((notices, key) =>
					needToSynchronize.push(
						(async () => {
							const lastType = getLastType(key);
							await KV.put(lastType, JSON.stringify(notices));
							await KV.delete(key);
						})()
					)
				);
		}
	}

	await Promise.allSettled(needToSynchronize).catch(() => {});
}

export function getLastType(key: string) {
	const [key1, noticeType, ...key2] = key.split('_');
	let lastType: NoticeType = NoticeType.All;

	switch (noticeType) {
		case NoticeType.Yesterday:
			lastType = NoticeType.All;
			break;
		case NoticeType.Today:
			lastType = NoticeType.Yesterday;
			break;
		case NoticeType.Tomorrow:
			lastType = NoticeType.Today;
			break;
	}

	return `${key1}_${lastType}_${key2.join('_')}`;
}

export function getNextType(key: string) {
	const [key1, noticeType, ...key2] = key.split('_');
	let nextType: NoticeType = NoticeType.All;

	switch (noticeType) {
		case NoticeType.Yesterday:
			nextType = NoticeType.Today;
			break;
		case NoticeType.Today:
			nextType = NoticeType.Tomorrow;
			break;
	}

	return `${key1}_${nextType}_${key2.join('_')}`;
}

export function checkIsInTimeRange(event: ScheduledController, env: Env, ctx: ExecutionContext) {
	const timeRange = env.TIME_RANGE;
	if (timeRange.length !== 2) return true;

	const time = getTimeWithZone(event.scheduledTime);
	const startOfDay = time.startOf('day').valueOf();
	const [start, end] = [dayjs(startOfDay + timeRange[0]), dayjs(startOfDay + timeRange[1])];

	return start.isBefore(time, 'minute') && end.isAfter(time, 'minute');
}

function getTimeWithZone(time: number) {
	return dayjs(time).add(8, 'hour');
}
