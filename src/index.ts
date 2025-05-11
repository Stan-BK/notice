import { PushSubscription } from 'web-push';
import { NoticeOperation, NoticeType } from './enums';
import updateNoticeList from './handleNotices';
import { generateVAPIDKeys, subscribe } from './subscription';

export default {
	async fetch(req, env) {
		const url = new URL(req.url);

		if (req.method == 'POST') {
			try {
				if (url.pathname == '/generateVAPIDKeys') return await generateVAPIDKeys(env['Notice-book'], JSON.parse(await req.json()));

				if (url.pathname == '/subscribe') {
					const { temporaryId, subscription } = JSON.parse(await req.json()) as {
						temporaryId: string;
						subscription: PushSubscription;
					};

					return await subscribe(env['Notice-book'], temporaryId, subscription);
				}

				if (url.pathname == '/update') {
					try {
						const type = url.searchParams.get('type') as NoticeType;
						const op = url.searchParams.get('op') as NoticeOperation;
						if (op == NoticeOperation.Add) return await updateNoticeList(env['Notice-book'], type, op, JSON.parse(await req.json()));
						else op == NoticeOperation.Remove;
						return await updateNoticeList(env['Notice-book'], type, op, Number(url.searchParams.get('id')));
					} catch (e) {
						return new Response('Error', {
							status: 403,
						});
					}
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
		// A Cron Trigger can make requests to other endpoints on the Internet,
		// publish to a Queue, query a D1 Database, and much more.
		//
		// We'll keep it simple and make an API call to a Cloudflare API:
		let resp = await fetch('https://api.cloudflare.com/client/v4/ips');
		let wasSuccessful = resp.ok ? 'success' : 'fail';

		// You could store this result in KV, write to a D1 Database, or publish to a Queue.
		// In this template, we'll just log the result:
		console.log(`trigger fired at ${event.cron}: ${wasSuccessful}`);
	},
} satisfies ExportedHandler<Env>;
