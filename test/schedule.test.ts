import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getLastType, getNextType, updateDailySchedule } from '../src/scheduled';
import { NoticeType } from '../src/enums';
import { Notice } from '../src/handleNotices';
import dayjs from 'dayjs';

describe('scheduler test cases', () => {
	it('getLastType', () => {
		expect(getLastType('notice_all_any')).toBe('notice_all_any');
		expect(getLastType('notice_tomorrow_any')).toBe('notice_today_any');
		expect(getLastType('notice_today_any')).toBe('notice_yesterday_any');
		expect(getLastType('notice_yesterday_any')).toBe('notice_all_any');
	});
	it('getNextType', () => {
		expect(getNextType('notice_today_any')).toBe('notice_tomorrow_any');
		expect(getNextType('notice_yesterday_any')).toBe('notice_today_any');
	});
	it('should update daily schedule correctly', async () => {
		const get = vi.fn();
		const put = vi.fn();
		const del = vi.fn();

		const notice = {
			noticeName: 'test',
			description: 'test',
			hour: 1,
			minute: 1,
		};
		const KV = {
			notice_all_any: JSON.stringify([notice]),
			notice_tomorrow_any: JSON.stringify([notice]),
			notice_today_any: JSON.stringify([notice]),
			notice_yesterday_any: JSON.stringify([notice]),
		}

		get.mockImplementation((key: keyof typeof KV) => {
			return Promise.resolve(KV[key]);
		});
		put.mockImplementation((key: keyof typeof KV, value: string) => {
			KV[key] = value;
			return Promise.resolve();
		})
		del.mockImplementation((key: keyof typeof KV) => {
			delete KV[key];
			return Promise.resolve();
		})

		const env = {
			'Notice-Book': {
				list: async () => ({
					keys: Object.keys(KV).map((key) => ({ name: key })),
				}),
				get,
				put,
				delete: del,
			},
		};

		await updateDailySchedule(
			{
				scheduledTime: dayjs().utc().hour(16).minute(0).valueOf(),
			} as any,
			env as any,
			{} as any
		);

		expect(put).toHaveBeenCalledTimes(3);
		expect(del).toHaveBeenCalledTimes(1);
		expect(KV['notice_tomorrow_any']).toBe(undefined);
		expect(KV['notice_today_any']).toBe(JSON.stringify([notice]));
		expect(KV['notice_yesterday_any']).toBe(JSON.stringify([notice]));
		expect(KV['notice_all_any']).toBe(JSON.stringify([notice, notice]));
	});
});
