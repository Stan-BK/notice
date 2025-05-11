import { NoticeOperation, NoticeType } from './enums';

export interface Notice {
	id: number;
	noticeName: string;
	description: string;
	hour: number;
	minute: number;
}

async function getNoticeList(KV: KVNamespace, type: NoticeType): Promise<Notice[]> {
	const notices = (await KV.get('notices:' + type, 'json')) as Notice[] | null;
	if (notices === null) return [];
	return notices;
}

async function updateNoticeList(
	KV: KVNamespace,
	type: NoticeType,
	notices: string
): Promise<Response> {
	await KV.put('notices:' + type, notices);
	return new Response(`Notice List: ${type} Update!`);
}

export {
	getNoticeList,
	updateNoticeList
};
