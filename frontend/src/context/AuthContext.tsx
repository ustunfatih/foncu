import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signInWithProvider: (provider: 'google' | 'github') => Promise<void>;
    signInWithEmail: (email: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isSupabaseConfigured) {
            setLoading(false);
            return;
        }
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const getRedirectTo = () => `${window.location.origin}/auth/callback`;

    const signInWithProvider = async (provider: 'google' | 'github') => {
        if (!isSupabaseConfigured) throw new Error('Hesap hizmeti henüz yapılandırılmadı.');
        const redirectHost = window.location.origin;
        const redirectTo = redirectHost.includes('localhost') ? `${redirectHost}/` : getRedirectTo();

        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo,
                queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
            }
        });
        if (error) throw error;
    };

    const signInWithEmail = async (email: string) => {
        if (!isSupabaseConfigured) throw new Error('Hesap hizmeti henüz yapılandırılmadı.');
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: getRedirectTo(), shouldCreateUser: true },
        });
        if (error) throw error;
    };

    const signOut = async () => {
        if (!isSupabaseConfigured) {
            return;
        }
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, signInWithProvider, signInWithEmail, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
