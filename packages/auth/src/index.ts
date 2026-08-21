import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient
} from "@supabase/supabase-js";

export interface OfficeIdentity {
  readonly userId: string;
  readonly displayName: string;
  readonly permissions: readonly string[];
  readonly serviceRegionIds: readonly string[];
}

export interface OfficeAuth {
  readonly client: SupabaseClient;
  session(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  accessToken(): Promise<string | null>;
  onChange(listener: (event: AuthChangeEvent, session: Session | null) => void): () => void;
}

export function createOfficeAuth(url: string, publishableKey: string): OfficeAuth {
  const client = createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  return {
    client,
    async session() {
      return (await client.auth.getSession()).data.session;
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    async accessToken() {
      return (await client.auth.getSession()).data.session?.access_token ?? null;
    },
    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((event, session) => listener(event, session));
      return () => data.subscription.unsubscribe();
    }
  };
}

export const createDriverAuth = createOfficeAuth;
export type DriverAuth = OfficeAuth;
