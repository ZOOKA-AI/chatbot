import {
  SiCanva,
  SiGithub,
  SiGmail,
  SiGoogle,
  SiGoogleads,
  SiGooglecalendar,
  SiGooglechrome,
  SiGoogledrive,
  SiGooglegemini,
  SiGooglemaps,
  SiHubspot,
  SiInstagram,
  SiMake,
  SiN8n,
  SiNotion,
  SiShopify,
  SiSlack,
  SiSnapchat,
  SiStripe,
  SiSupabase,
  SiTiktok,
  SiTwilio,
  SiVercel,
  SiWhatsapp,
  SiX,
  SiZapier,
} from "@icons-pack/react-simple-icons";
import { Cable, Linkedin } from "lucide-react";

const icons = {
  gmail: SiGmail,
  google_drive: SiGoogledrive,
  google_calendar: SiGooglecalendar,
  google_ads: SiGoogleads,
  google_maps: SiGooglemaps,
  google_business: SiGoogle,
  gemini: SiGooglegemini,
  my_browser: SiGooglechrome,
  instagram: SiInstagram,
  whatsapp: SiWhatsapp,
  snapchat: SiSnapchat,
  tiktok: SiTiktok,
  x: SiX,
  github: SiGithub,
  supabase: SiSupabase,
  vercel: SiVercel,
  stripe: SiStripe,
  n8n: SiN8n,
  zapier: SiZapier,
  make: SiMake,
  notion: SiNotion,
  slack: SiSlack,
  shopify: SiShopify,
  twilio: SiTwilio,
  canva: SiCanva,
  hubspot: SiHubspot,
};
const colors: Record<string, string> = {
  gmail: "#ea6657",
  google_drive: "#6dcc99",
  instagram: "#ed83b2",
  whatsapp: "#68d891",
  snapchat: "#f9ef81",
  tiktok: "#83e3df",
  n8n: "#ee7f9f",
  zapier: "#ff9d6d",
  make: "#c9a0ff",
  stripe: "#a9a0ff",
  supabase: "#7fe4b1",
  canva: "#7adade",
  hubspot: "#f99b83",
};
export function ProviderIcon({ id }: { id: string }) {
  if (id === "linkedin") return <Linkedin size={24} />;
  const Icon = icons[id as keyof typeof icons];
  return Icon ? (
    <Icon aria-hidden="true" color={colors[id] ?? "currentColor"} size={24} />
  ) : (
    <Cable size={23} />
  );
}
