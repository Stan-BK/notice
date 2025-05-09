import { NoticeOperation, NoticeType } from './enums';

export interface Notice {
	id: number;
	noticeName: string;
	description: string;
	hour: number;
	minute: number;
}

async function updateNoticeList(KV: KVNamespace, type: NoticeType, opType: NoticeOperation.Remove, notice: number): Promise<Response>;
async function updateNoticeList(KV: KVNamespace, type: NoticeType, opType: NoticeOperation.Add, notice: Notice): Promise<Response>;
async function updateNoticeList(
	KV: KVNamespace,
	type: NoticeType,
	opType: NoticeOperation.Add | NoticeOperation.Remove,
	notice: Notice | number
): Promise<Response> {
	let notices = (await KV.get('notices:' + type, 'json')) as Notice[] | null;
	if (notices === null) await KV.put('notices:' + type, JSON.stringify([]));
	notices = JSON.parse((await KV.get('notices:' + type, 'json')) as string) as Notice[];

	if (opType == NoticeOperation.Add) {
		notices.push(notice as Notice);
		await KV.put('notices:' + type, JSON.stringify(notices));
	}
	if (opType == NoticeOperation.Remove) {
		notices = notices.filter((n) => n.id != notice);
		await KV.put('notices:' + type, JSON.stringify(notices));
	}
	return new Response(`Notice List: ${type} Update!`);
}

export default updateNoticeList;
