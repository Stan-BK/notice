import webPush, { PushSubscription } from 'web-push';
import { VapidKeys } from './enums';

export const generateVAPIDKeys = async (KV: KVNamespace, temporaryId: string) => {
	if (!KV.get(VapidKeys.PublicKey)) {
		const { publicKey, privateKey } = webPush.generateVAPIDKeys();

		await KV.put(VapidKeys.PublicKey, publicKey);
		await KV.put(VapidKeys.PrivateKey, privateKey);
	}
	await KV.put(`temporary subscriptions: ${temporaryId}`, temporaryId);

	// Get the keys from the KV store.
	const publicKey = await KV.get(VapidKeys.PublicKey);
	const privateKey = await KV.get(VapidKeys.PrivateKey);

	// Set the keys used for encrypting the push messages.
	webPush.setVapidDetails('https://notice.geminikspace.com/', publicKey!, privateKey!);

	return new Response(publicKey);
};

export const subscribe = async (KV: KVNamespace, temporaryId: string, subscription: PushSubscription) => {
	const res = await KV.get(`temporary subscriptions: ${temporaryId}`);
	if (res == null) {
		return new Response('Invalid temporary id', {
			status: 403,
		});
	}
	await KV.delete(`temporary subscriptions: ${temporaryId}`);
	await KV.put('subscriptions:' + subscription.endpoint, JSON.stringify(subscription));
	return new Response('Subscription successful');
};
