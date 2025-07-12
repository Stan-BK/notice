import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Notice } from './handleNotices';
import { NoticeType, VapidKeys } from './enums';
import { pushNotification } from './subscription';
import { PushSubscription } from 'web-push';
dayjs.extend(utc);

export async function pollSchedule(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
	const time = dayjs(event.scheduledTime).utc().add(8, 'hour');
	const KV = env['Notice-book'];
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
	const time = dayjs(event.scheduledTime).utc().add(8, 'hour');
	if (time.get('hour') != 0 && time.get('minute') != 0) return;

	const KV = env['Notice-book'];
	const keys = await KV.list();
	const noticeListMap: Record<NoticeType, Map<string, Notice[]>> = {
		all: new Map<string, Notice[]>(),
		yesterday: new Map<string, Notice[]>(),
		today: new Map<string, Notice[]>(),
		tomorrow: new Map<string, Notice[]>(),
	};
	const kvs = Object.values(noticeListMap);

	for (const key of keys.keys) {
		if (key.name.startsWith(`notice_`)) {
			const type = key.name.split('_')[1] as NoticeType;
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
							await KV.put(lastType, JSON.stringify(lastTypeNotices?.concat(notices)));
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
							await KV.delete(key); // delete today's notice list
						})()
					)
				);
		}
	}

	await Promise.allSettled(needToSynchronize).catch(() => {});

	function getLastType(key: string) {
		const [key1, noticeType, key2] = key.split('_');
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

		return `${key1}_${lastType}_${key2}`;
	}
}
