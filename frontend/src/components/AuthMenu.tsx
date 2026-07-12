import { FormEvent, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface AuthMenuProps {
  canSave: boolean;
  onSave: () => Promise<void>;
}

const AuthMenu = ({ canSave, onSave }: AuthMenuProps) => {
  const { user, signInWithEmail, signInWithProvider, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, success?: string) => {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      if (success) setStatus(success);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    void run(() => signInWithEmail(email.trim()), 'Giriş bağlantısını e-posta adresinize gönderdik.');
  };

  if (user) {
    return (
      <div className="account-actions">
        <span className="account-identity">{user.email || 'Foncu hesabı'}</span>
        <button className="button button-secondary" onClick={() => void run(onSave, 'Portföy kaydedildi.')} disabled={!canSave || busy}>Kaydet</button>
        <button className="button button-quiet" onClick={() => void run(signOut)} disabled={busy}>Çıkış</button>
        {status && <span className="auth-status" role="status">{status}</span>}
      </div>
    );
  }

  return (
    <details className="auth-menu">
      <summary className="button button-primary">Hesabım</summary>
      <div className="auth-popover">
        <p className="auth-title">Portföyünüz her cihazda yanınızda</p>
        <p className="auth-copy">Temel analizler için hesap gerekmez. Yalnızca kaydetmek istediğinizde giriş yapın.</p>
        <form onSubmit={submitEmail} className="auth-form">
          <label htmlFor="auth-email">E-posta</label>
          <input id="auth-email" className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ornek@email.com" required />
          <button className="button button-primary" type="submit" disabled={busy || !isSupabaseConfigured}>Bağlantı gönder</button>
        </form>
        <div className="auth-divider"><span>veya</span></div>
        <button className="button button-secondary auth-provider" onClick={() => void run(() => signInWithProvider('google'))} disabled={busy || !isSupabaseConfigured}>Google ile devam et</button>
        <button className="button button-quiet auth-provider" onClick={() => void run(() => signInWithProvider('github'))} disabled={busy || !isSupabaseConfigured}>GitHub ile devam et</button>
        {!isSupabaseConfigured && <p className="auth-status">Hesap senkronizasyonu yapılandırılana kadar yerel kullanım açık.</p>}
        {status && <p className="auth-status" role="status">{status}</p>}
      </div>
    </details>
  );
};

export default AuthMenu;
