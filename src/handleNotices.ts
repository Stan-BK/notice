import { NoticeOperation, NoticeType } from './enums';

export interface Notice {
	noticeName: string;
	description: string;
	hour: number;
	minute: number;
}

async function getNoticeList(KV: KVNamespace, endPoint: string, type: NoticeType): Promise<string> {
	const noticeList = (await KV.get(`notice_${type}_${endPoint}`, 'json')) as string | null;
	if (noticeList === null) return '[]';
	return noticeList;
}

async function updateNoticeList(KV: KVNamespace, endPoint: string, type: NoticeType, notices: string): Promise<Response> {
	await KV.put(`notice_${type}_${endPoint}`, notices);
	return new Response(`Notice List: ${type} Update!`);
}

export { getNoticeList, updateNoticeList };
