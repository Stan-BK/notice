import { NoticeType } from './enums'

export interface Notice {
	noticeName: string
	description: string
	hour: number
	minute: number
	isRepeat?: boolean
}

async function getNoticeList(KV: KVNamespace, endPoint: string, type: NoticeType) {
	const noticeList = await KV.get<Notice>(`notice_${type}_${endPoint}`, 'json')
	if (noticeList === null) return []
	return noticeList
}

async function updateNoticeList(KV: KVNamespace, endPoint: string, type: NoticeType, notices: Notice[]): Promise<Response> {
	await KV.put(`notice_${type}_${endPoint}`, JSON.stringify(notices))
	return new Response(`Notice List: ${type} Update!`)
}

async function removeNoticeList(KV: KVNamespace, endPoint: string, type: NoticeType) {
	await KV.delete(`notice_${type}_${endPoint}`)
}

export { getNoticeList, updateNoticeList, removeNoticeList }
