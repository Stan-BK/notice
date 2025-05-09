import webPush, { PushSubscription } from 'web-push';
import { VapidKeys } from './enums';

export default async (KV: KVNamespace, subscription: PushSubscription) => {
	if (!KV.get(VapidKeys.PublicKey)) {
		const { publicKey, privateKey } = webPush.generateVAPIDKeys();

		await KV.put(VapidKeys.PublicKey, publicKey);
		await KV.put(VapidKeys.PrivateKey, privateKey);
	}
	await KV.put('subscriptions:' + subscription.endpoint, JSON.stringify(subscription));

	// Get the keys from the KV store.
	const publicKey = await KV.get(VapidKeys.PublicKey);
	const privateKey = await KV.get(VapidKeys.PrivateKey);

	// Set the keys used for encrypting the push messages.
	webPush.setVapidDetails('https://example.com/', publicKey!, privateKey!);

	return new Response("Subscribed!");
};
