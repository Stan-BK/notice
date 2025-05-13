import { PushSubscription } from 'web-push';
import { NoticeType, VapidKeys } from './enums';
import { getNoticeList, Notice, updateNoticeList } from './handleNotices';
import { generateVAPIDKeys, pushNotification as sendNotification, subscribe } from './subscription';
import dayjs from 'dayjs';

const PATH = '/worker';
const SUBJECT = 'https://notice.geminikspace.com';

export default {
	async fetch(req, env) {
		const url = new URL(req.url);

		if (req.method == 'POST') {
			try {
				if (url.pathname == `${PATH}/generateVAPIDKeys`) return await generateVAPIDKeys(env['Notice-book'], await req.text());

				if (url.pathname == `${PATH}/subscribe`) {
					const { temporaryId, subscription } = (await req.json()) as {
						temporaryId: string;
						subscription: PushSubscription;
					};

					return await subscribe(env['Notice-book'], temporaryId, subscription);
				}

				if (url.pathname == `${PATH}/update`) {
					try {
						const type = url.searchParams.get('type') as NoticeType;
						const { endPoint, noticeList } = (await req.json()) as {
							endPoint: string;
							noticeList: Notice[];
						};

						return await updateNoticeList(env['Notice-book'], endPoint, type, noticeList);
					} catch (e) {
						return new Response('Error', {
							status: 403,
						});
					}
				}

				if (url.pathname == `${PATH}/noticeList`) {
					const { endPoint } = (await req.json()) as {
						endPoint: string;
					};
					return new Response(
						JSON.stringify(await getNoticeList(env['Notice-book'], endPoint, url.searchParams.get('type') as NoticeType))
					);
				}
			} catch (e) {
				return new Response('Error', {
					status: 403,
				});
			}
		}
		return new Response('Unknown path');
	},

	// The scheduled handler is invoked at the interval set in our wrangler.jsonc's
	// [[triggers]] configuration.
	async scheduled(event, env, ctx): Promise<void> {
		const time = dayjs(event.scheduledTime);
		const KV = env['Notice-book'];
		const keys = await KV.list();
		const needToNotice: {
			endPoint: string;
			notices: Notice[];
		}[] = [];
		for (const key of keys.keys) {
			if (key.name.startsWith(`notice_${NoticeType.Today}`)) {
				needToNotice.push({
					endPoint: key.name.split('_')[3],
					notices: (await KV.get(key.name, 'json'))!,
				});
			}
		}
		for (const { endPoint, notices } of needToNotice) {
			for (const notice of notices) {
				if (notice.hour == time.get('hour') && notice.minute == time.get('minute')) {
					await sendNotification(JSON.parse((await KV.get(`subscription_${endPoint}`))!) as PushSubscription, notice, {
						subject: SUBJECT,
						publicKey: (await KV.get(`${VapidKeys.PublicKey}_${endPoint}`))!,
						privateKey: (await KV.get(`${VapidKeys.PrivateKey}_${endPoint}`))!,
					});
				}
			}
		}
	},
} satisfies ExportedHandler<Env>;
