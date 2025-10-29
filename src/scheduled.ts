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

	const needNotificationSubs = [];
	const needNotifications = [];
	for (const { endPoint, notices } of needToNotice) {
		for (const notice of notices) {
			if (notice.hour == time.get('hour') && notice.minute == time.get('minute')) {
				needNotificationSubs.push(endPoint);
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
	console.log('need notification subscriptions:', needNotificationSubs);
	await Promise.allSettled(needNotifications).catch(() => {});
}

export async function updateDailySchedule(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
	const time = getTimeWithZone(event.scheduledTime);
	if (time.get('hour') != 0 || time.get('minute') != 0) return;

	console.log('update daily schedule at', time.format('YYYY-MM-DD HH:mm:ss'));
	const KV = env['Notice-Book'];
	const keys = await KV.list();
	const noticeListMap: Record<NoticeType, Map<string, Notice[]>> = {
		[NoticeType.All]: new Map(),
		[NoticeType.Yesterday]: new Map(),
		[NoticeType.Today]: new Map(),
		[NoticeType.Tomorrow]: new Map(),
	};

	for (const key of keys.keys) {
		if (key.name.startsWith(`notice_`)) {
			const type = key.name.split('_')[1] as NoticeType;
			noticeListMap[type].set(key.name, (await KV.get(key.name, 'json'))!);
		}
	}

	const noticeListEntries = [NoticeType.Yesterday, NoticeType.Today, NoticeType.Tomorrow].map((type) => [type, noticeListMap[type]]) as [
		NoticeType,
		Map<string, Notice[]>
	][];

	console.log('notice list entries:', noticeListEntries);
	for (let i = 0; i < noticeListEntries.length; i++) {
		const needToSynchronize: Promise<void>[] = [];
		const [type, noticeList] = noticeListEntries[i];
		switch (type) {
			case NoticeType.Yesterday:
				noticeList.forEach((notices, key) =>
					needToSynchronize.push(
						(async () => {
							const lastType = getLastType(key);
							const lastTypeNotices = noticeListMap[NoticeType.All].get(lastType) ?? [];
							await KV.put(lastType, JSON.stringify(lastTypeNotices.concat(notices)));
							await KV.delete(key);
						})()
					)
				);
				break;
			case NoticeType.Today:
				noticeList.forEach((notices, key) =>
					needToSynchronize.push(
						(async () => {
							const lastType = getLastType(key);
							const noticesNeedRepeat: Notice[] = [];
							const noticesNeedUpdate: Notice[] = [];

							notices.forEach(notice => {
								if (notice.isRepeat) {
									noticesNeedRepeat.push(notice);
								} else {
									noticesNeedUpdate.push(notice);
								}
							});

							await KV.put(lastType, JSON.stringify(noticesNeedUpdate));
							await KV.put(key, JSON.stringify(noticesNeedRepeat));
						})()
					)
				);
				break;
			case NoticeType.Tomorrow:
				noticeList.forEach((notices, key) =>
					needToSynchronize.push(
						(async () => {
							const lastType = getLastType(key);
							const lastTypeNotices = noticeListMap[NoticeType.Today].get(lastType)?.filter(notice => notice.isRepeat) ?? [];
							await KV.put(lastType, JSON.stringify(lastTypeNotices.concat(notices)));
							await KV.delete(key);
						})()
					)
				);
		}
		await Promise.allSettled(needToSynchronize).catch(() => {});
	}
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

export function checkIsInTimeRange(event: ScheduledController, env: Env, ctx: ExecutionContext) {
	const timeRange = env.TIME_RANGE;
	console.log(`current cron's schedule time: ${event.scheduledTime}, format like: ${dayjs(event.scheduledTime).format('YYYY-MM-DD HH:mm:ss')}`);
	if (timeRange.length !== 2) return true;

	const time = getTimeWithZone(event.scheduledTime);
	const startOfDay = time.startOf('day').valueOf();
	const [start, end] = [dayjs(startOfDay + timeRange[0]), dayjs(startOfDay + timeRange[1])];

	const isInTimeRange = start.isBefore(time, 'minute') && end.isAfter(time, 'minute');
	console.log('isInTimeRange:', isInTimeRange);
	return isInTimeRange;
}

function getTimeWithZone(time: number) {
	return dayjs(time).add(8, 'hour');
}
