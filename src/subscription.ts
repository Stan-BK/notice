import webPush, { type PushSubscription, RequestOptions, sendNotification } from 'web-push';
import { VapidKeys } from './enums';
import { Notice } from './handleNotices';

export const generateVAPIDKeys = async (KV: KVNamespace, temporaryId: string) => {
	const { publicKey, privateKey } = webPush.generateVAPIDKeys();

	await KV.put(`temporary subscription: ${temporaryId}`, temporaryId);
	await KV.put(`${VapidKeys.PublicKey}_${temporaryId}`, publicKey);
	await KV.put(`${VapidKeys.PrivateKey}_${temporaryId}`, privateKey);

	return new Response(publicKey);
};

export const subscribe = async (KV: KVNamespace, temporaryId: string, subscription: PushSubscription) => {
	const res = await KV.get(`temporary subscription: ${temporaryId}`);
	if (res == null) {
		return new Response('Invalid temporary id', {
			status: 403,
		});
	}
	await KV.delete(`temporary subscription: ${temporaryId}`);

	const publicKey = await KV.get(`${VapidKeys.PublicKey}_${temporaryId}`);
	await KV.put(`${VapidKeys.PublicKey}_${subscription.endpoint}`, publicKey!);
	await KV.delete(`${VapidKeys.PublicKey}_${temporaryId}`);

	const privateKey = await KV.get(`${VapidKeys.PrivateKey}_${temporaryId}`);
	await KV.put(`${VapidKeys.PrivateKey}_${subscription.endpoint}`, privateKey!);
	await KV.delete(`${VapidKeys.PrivateKey}_${temporaryId}`);

	await KV.put('subscription_' + subscription.endpoint, JSON.stringify(subscription));

	return new Response('Subscription successful');
};

export const pushNotification = async (pushSubscription: PushSubscription, notice: Notice, vapidDetails: RequestOptions['vapidDetails']) => {
	sendNotification(pushSubscription, JSON.stringify(notice), {
		vapidDetails
	});
}
