import "server-only";
import { readHub } from "@/lib/integration-hub/server";
export type LiveIntegrationStatus = { connected:Set<string>; needsReconnect:Set<string> };
/** Compatibility surface: a positive badge now requires a recent provider probe. */
export async function getLiveIntegrationStatus(organizationId:string,_options:{googleConfigured?:boolean}={}):Promise<LiveIntegrationStatus>{
  const connected=new Set<string>();const needsReconnect=new Set<string>();
  try{for(const provider of await readHub(organizationId)){
    if(provider.state==="VERIFIED")connected.add(provider.id);
    if(provider.state==="EXPIRED")needsReconnect.add(provider.id);
  }}catch{/* No migration/DB means unknown, never verified. The Hub shows the actionable failure. */}
  return {connected,needsReconnect};
}
