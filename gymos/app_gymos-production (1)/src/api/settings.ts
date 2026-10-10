import { apiGet } from "@/api/client";

export interface PublicSettings {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  backgroundColorDark?: string | null;
  hasTenant: boolean;
}

export const fetchPublicSettings = () => apiGet<PublicSettings>("/api/settings/public");
