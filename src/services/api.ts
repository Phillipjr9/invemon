import type { InvestmentAccount } from '../components/Dialogs';
// Production builds default to server accounts. A demo-only deployment must opt out.
export const SERVER_ACCOUNTS = import.meta.env.VITE_ACCOUNT_MODE === 'server' || (import.meta.env.PROD && import.meta.env.VITE_ACCOUNT_MODE !== 'demo');
export async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
 const response = await fetch(`/api/${path}`, { method, credentials: 'same-origin', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
 const result = await response.json().catch(() => ({ error: 'Account service unavailable. Check the server configuration.' }));
 if (!response.ok || result.error) throw new Error(result.error || 'Request failed. Try again.');
 return result as T;
}
export const accountAction = (action: string, data: Record<string, unknown> = {}) => api<{account?: InvestmentAccount; mfaRequired?: boolean; id?: string; emailStatus?: string}>('account', 'POST', { ...data, action });
export function downloadJson(filename: string, value: unknown) {
 const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
 const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
