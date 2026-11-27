export type LedgerBalance={asset:string;units:string;decimals:number;reservedUnits?:string;unreservedUnits?:string};
/** Exact atomic-unit display, without converting financial values to Number. */
export function formatLedgerUnits(units:string,decimals:number){
 if(!/^-?\d+$/.test(units)||!Number.isInteger(decimals)||decimals<0||decimals>30)throw new Error('Invalid ledger amount');
 const value=BigInt(units),negative=value<0n;const digits=(negative?-value:value).toString().padStart(decimals+1,'0');
 const whole=(decimals?digits.slice(0,-decimals):digits).replace(/\B(?=(\d{3})+(?!\d))/g,',');
 const fraction=decimals?digits.slice(-decimals).replace(/0+$/,''):'';
 return `${negative?'-':''}${whole}${fraction?'.'+fraction:''}`;
}
