import policies from '../shared/legal-policies.json' with {type:'json'};
import {sha,HttpError} from './core.mjs';
export const POLICY_VERSION=policies.version;
export const POLICY_DIGEST=sha(JSON.stringify(policies));
export function requireLegalAcceptance(input){
 if(input.policyVersion!==POLICY_VERSION)throw new HttpError(409,'The account policies changed. Reload signup and review the current documents before accepting.');
 if(input.termsAccepted!==true||input.privacyAcknowledged!==true||input.riskAcknowledged!==true||input.adultConfirmed!==true)throw new HttpError(400,'Accept the Terms and Funding Conditions, acknowledge the Privacy Notice and Risk Disclosure, and confirm you are at least 18.');
}
export function legalAcceptanceQueries(sql,userId){
 return [sql`INSERT INTO legal_policy_bundles(version,digest,documents) VALUES(${POLICY_VERSION},${POLICY_DIGEST},${JSON.stringify(policies)}::jsonb) ON CONFLICT(version) DO NOTHING`,
 sql`INSERT INTO account_legal_acceptances(user_id,policy_version,policy_digest,terms_accepted,privacy_acknowledged,risk_acknowledged,adult_confirmed,source) VALUES(${userId},${POLICY_VERSION},${POLICY_DIGEST},true,true,true,true,'signup')`];
}
