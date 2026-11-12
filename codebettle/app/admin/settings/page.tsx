'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
import FadeIn from '@/components/ui/FadeIn';
import { Save, Globe, Mail, Phone, AlertTriangle, CreditCard, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PaymentAccount, PaymentMethod } from '@/lib/db/types';
import type { SocialLink } from '@/lib/db/types';
import { SocialPlatformIcon } from '@/components/auth/BrandIcons';
import { resolvePlatformKey } from '@/lib/social';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  bank: 'Bank transfer',
  easypaisa: 'Easypaisa',
  jazzcash: 'JazzCash',
  wallet: 'Wallet',
  other: 'Other',
};

const METHOD_OPTIONS = (Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => ({
  value: m,
  label: METHOD_LABELS[m],
}));

interface AccountForm {
  label: string;
  method: PaymentMethod;
  accountHolder: string;
  bankName: string;
  accountNumber: string;
  iban: string;
  walletNumber: string;
  instructions: string;
  isActive: boolean;
  displayOrder: number;
}

const EMPTY_FORM: AccountForm = {
  label: '',
  method: 'bank',
  accountHolder: '',
  bankName: '',
  accountNumber: '',
  iban: '',
  walletNumber: '',
  instructions: '',
  isActive: true,
  displayOrder: 0,
};

function accountRef(account: PaymentAccount): string {
  return account.accountNumber ?? account.iban ?? account.walletNumber ?? '—';
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState({
    siteName: 'CodeBettle',
    siteDescription: "Pakistan's premier digital institute",
    contactEmail: 'info@codebettle.com',
    phone: '+92 305 5261893',
    address: 'Lahore, Punjab, Pakistan',
    maintenanceMode: false,
  });
  const [saving, setSaving] = useState(false);

  // Load the persisted settings on mount. The useState defaults above
  // are only the pre-load placeholder — the saved values replace them
  // as soon as the fetch returns. A failed load leaves the placeholders
  // in place and says so, instead of silently showing stale values.
  const loadSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not load settings');
      if (data.settings) setSettings(data.settings);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load settings');
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not save settings');
      if (data.settings) setSettings(data.settings);
      toast.success('Settings saved successfully!');
    } catch (e) {
      // Never toast success when the save failed — that was the bug.
      toast.error(e instanceof Error ? e.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  // --- Payment Accounts Management (real backend, Phase 1e) ---
  // Every change goes through /api/admin/payment-accounts and is verified
  // by re-fetching the list afterwards — the saved state shown is the
  // state read back from the server, never an optimistic local guess.
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaymentAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAccounts = async (): Promise<PaymentAccount[]> => {
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const res = await fetch('/api/admin/payment-accounts');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not load payment accounts');
      const list = (data.accounts ?? []) as PaymentAccount[];
      setAccounts(list);
      return list;
    } catch (e) {
      setAccountsError(e instanceof Error ? e.message : 'Could not load payment accounts');
      return [];
    } finally {
      setAccountsLoading(false);
    }
  };

  useEffect(() => {
    void loadAccounts();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, displayOrder: accounts.length });
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (account: PaymentAccount) => {
    setEditing(account);
    setForm({
      label: account.label,
      method: account.method,
      accountHolder: account.accountHolder,
      bankName: account.bankName ?? '',
      accountNumber: account.accountNumber ?? '',
      iban: account.iban ?? '',
      walletNumber: account.walletNumber ?? '',
      instructions: account.instructions ?? '',
      isActive: account.isActive,
      displayOrder: account.displayOrder,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const saveForm = async () => {
    if (!form.label.trim()) { setFormError('Label is required'); return; }
    if (!form.accountHolder.trim()) { setFormError('Account holder is required'); return; }
    if (!form.accountNumber.trim() && !form.iban.trim() && !form.walletNumber.trim()) {
      setFormError('Provide an account number, IBAN or wallet number');
      return;
    }
    setFormError(null);
    setFormSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        method: form.method,
        accountHolder: form.accountHolder.trim(),
        bankName: form.bankName.trim() || undefined,
        accountNumber: form.accountNumber.trim() || undefined,
        iban: form.iban.trim() || undefined,
        walletNumber: form.walletNumber.trim() || undefined,
        instructions: form.instructions.trim() || undefined,
        isActive: form.isActive,
        displayOrder: form.displayOrder,
      };
      const res = await fetch(
        editing ? `/api/admin/payment-accounts/${editing.id}` : '/api/admin/payment-accounts',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not save payment account');
      // Read-back: re-fetch the list and confirm the saved account is there.
      const list = await loadAccounts();
      const saved = list.find((a) => a.id === (data.account as PaymentAccount).id);
      if (!saved) throw new Error('Saved, but the account did not come back from the server — please reload');
      setFormOpen(false);
      toast.success(editing ? 'Payment account updated' : 'Payment account added');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save payment account');
    } finally {
      setFormSaving(false);
    }
  };

  const toggleActive = async (account: PaymentAccount) => {
    try {
      const res = await fetch(`/api/admin/payment-accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !account.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not update payment account');
      const list = await loadAccounts();
      const saved = list.find((a) => a.id === account.id);
      if (!saved || saved.isActive === account.isActive) {
        throw new Error('The change did not persist — please reload');
      }
      toast.success(saved.isActive ? 'Payment account activated' : 'Payment account deactivated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update payment account');
    }
  };

  const moveAccount = async (account: PaymentAccount, direction: -1 | 1) => {
    const idx = accounts.findIndex((a) => a.id === account.id);
    const neighbour = accounts[idx + direction];
    if (!neighbour) return;
    try {
      const patch = async (id: string, displayOrder: number) => {
        const res = await fetch(`/api/admin/payment-accounts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayOrder }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Could not reorder payment accounts');
        }
      };
      await patch(account.id, neighbour.displayOrder);
      await patch(neighbour.id, account.displayOrder);
      await loadAccounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reorder payment accounts');
      await loadAccounts();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/payment-accounts/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not delete payment account');
      const list = await loadAccounts();
      if (list.some((a) => a.id === deleteTarget.id)) {
        throw new Error('The account was not deleted — please reload');
      }
      setDeleteTarget(null);
      toast.success('Payment account deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete payment account');
    } finally {
      setDeleting(false);
    }
  };

  // --- Footer Social Icons (real backend, Phase 4 Module 7) ---
  // Same pattern as Payment Accounts above: every change goes through
  // /api/admin/social-links and is verified by re-fetching the list
  // afterwards. Only two things are required per icon: Icon Name and
  // Icon Link. The icon itself is auto-fetched from the name (no image
  // upload). Only enabled icons are shown in the footer; while no
  // rows exist the footer falls back to its hardcoded defaults.
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [socialLoading, setSocialLoading] = useState(true);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [socialFormOpen, setSocialFormOpen] = useState(false);
  const [socialEditing, setSocialEditing] = useState<SocialLink | null>(null);
  const [socialForm, setSocialForm] = useState({ name: '', url: '', isEnabled: true, displayOrder: 0 });
  const [socialFormError, setSocialFormError] = useState<string | null>(null);
  const [socialFormSaving, setSocialFormSaving] = useState(false);
  const [socialDeleteTarget, setSocialDeleteTarget] = useState<SocialLink | null>(null);
  const [socialDeleting, setSocialDeleting] = useState(false);

  const loadSocialLinks = async (): Promise<SocialLink[]> => {
    setSocialLoading(true);
    setSocialError(null);
    try {
      const res = await fetch('/api/admin/social-links');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not load footer social icons');
      const list = (data.links ?? []) as SocialLink[];
      setSocialLinks(list);
      return list;
    } catch (e) {
      setSocialError(e instanceof Error ? e.message : 'Could not load footer social icons');
      return [];
    } finally {
      setSocialLoading(false);
    }
  };

  useEffect(() => {
    void loadSocialLinks();
  }, []);

  const openSocialAdd = () => {
    setSocialEditing(null);
    setSocialForm({ name: '', url: '', isEnabled: true, displayOrder: socialLinks.length });
    setSocialFormError(null);
    setSocialFormOpen(true);
  };

  const openSocialEdit = (link: SocialLink) => {
    setSocialEditing(link);
    setSocialForm({
      name: link.name,
      url: link.url,
      isEnabled: link.isEnabled,
      displayOrder: link.displayOrder,
    });
    setSocialFormError(null);
    setSocialFormOpen(true);
  };

  const saveSocialForm = async () => {
    if (!socialForm.name.trim()) { setSocialFormError('Icon name is required'); return; }
    if (!socialForm.url.trim()) { setSocialFormError('Icon link is required'); return; }
    setSocialFormError(null);
    setSocialFormSaving(true);
    try {
      const payload = {
        name: socialForm.name.trim(),
        url: socialForm.url.trim(),
        isEnabled: socialForm.isEnabled,
        displayOrder: socialForm.displayOrder,
      };
      const res = await fetch(
        socialEditing ? `/api/admin/social-links/${socialEditing.id}` : '/api/admin/social-links',
        {
          method: socialEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not save social icon');
      // Read-back: re-fetch the list and confirm the saved icon is there.
      const list = await loadSocialLinks();
      const saved = list.find((l) => l.id === (data.link as SocialLink).id);
      if (!saved) throw new Error('Saved, but the icon did not come back from the server — please reload');
      setSocialFormOpen(false);
      toast.success(socialEditing ? 'Social icon updated' : 'Social icon added');
    } catch (e) {
      setSocialFormError(e instanceof Error ? e.message : 'Could not save social icon');
    } finally {
      setSocialFormSaving(false);
    }
  };

  const toggleSocialEnabled = async (link: SocialLink) => {
    try {
      const res = await fetch(`/api/admin/social-links/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !link.isEnabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not update social icon');
      const list = await loadSocialLinks();
      const saved = list.find((l) => l.id === link.id);
      if (!saved || saved.isEnabled === link.isEnabled) {
        throw new Error('The change did not persist — please reload');
      }
      toast.success(saved.isEnabled ? 'Social icon enabled' : 'Social icon disabled');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update social icon');
    }
  };

  const moveSocialLink = async (link: SocialLink, direction: -1 | 1) => {
    const idx = socialLinks.findIndex((l) => l.id === link.id);
    const neighbour = socialLinks[idx + direction];
    if (!neighbour) return;
    try {
      const patch = async (id: string, displayOrder: number) => {
        const res = await fetch(`/api/admin/social-links/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayOrder }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Could not reorder social icons');
        }
      };
      await patch(link.id, neighbour.displayOrder);
      await patch(neighbour.id, link.displayOrder);
      await loadSocialLinks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reorder social icons');
      await loadSocialLinks();
    }
  };

  const confirmSocialDelete = async () => {
    if (!socialDeleteTarget) return;
    setSocialDeleting(true);
    try {
      const res = await fetch(`/api/admin/social-links/${socialDeleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not delete social icon');
      const list = await loadSocialLinks();
      if (list.some((l) => l.id === socialDeleteTarget.id)) {
        throw new Error('The icon was not deleted — please reload');
      }
      setSocialDeleteTarget(null);
      toast.success('Social icon deleted');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete social icon');
    } finally {
      setSocialDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <FadeIn>
        <h1 className="text-2xl font-black text-foreground">Site Settings</h1>
        <p className="text-muted text-sm mt-1">Configure platform-wide settings</p>
      </FadeIn>

      <FadeIn delay={0.05}>
      <Card>
        <h2 className="text-foreground font-bold mb-4 flex items-center gap-2"><Globe className="w-4 h-4 text-primary-text" />General</h2>
        <div className="space-y-4">
          <Input label="Site Name" value={settings.siteName} onChange={e => setSettings(s => ({ ...s, siteName: e.target.value }))} />
          <Input label="Site Description" value={settings.siteDescription} onChange={e => setSettings(s => ({ ...s, siteDescription: e.target.value }))} />
        </div>
      </Card>
      </FadeIn>

      <FadeIn delay={0.1}>
      <Card>
        <h2 className="text-foreground font-bold mb-4 flex items-center gap-2"><Mail className="w-4 h-4 text-primary-text" />Contact</h2>
        <div className="space-y-4">
          <Input label="Contact Email" type="email" value={settings.contactEmail} onChange={e => setSettings(s => ({ ...s, contactEmail: e.target.value }))} />
          <Input label="Phone" value={settings.phone} onChange={e => setSettings(s => ({ ...s, phone: e.target.value }))} />
          <Input label="Address" value={settings.address} onChange={e => setSettings(s => ({ ...s, address: e.target.value }))} />
        </div>
      </Card>
      </FadeIn>

      <FadeIn delay={0.15}>
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-foreground font-bold flex items-center gap-2"><Share2 className="w-4 h-4 text-primary-text" />Footer Social Icons</h2>
          <Button size="sm" onClick={openSocialAdd}><Plus className="w-4 h-4" />Add Icon</Button>
        </div>
        <p className="text-muted text-sm mb-4">Icons shown in the website footer. Only the icon name and link are needed — the icon is fetched automatically from the name. Only enabled icons are shown; while no icons are added here, the footer shows its default LinkedIn, Instagram, Facebook, GitHub, WhatsApp and Email links.</p>
        {socialLoading && <p className="text-muted text-sm">Loading footer social icons…</p>}
        {socialError && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-red-400">{socialError}</p>
            <Button size="sm" variant="outline" onClick={() => void loadSocialLinks()}>Retry</Button>
          </div>
        )}
        {!socialLoading && !socialError && socialLinks.length === 0 && (
          <p className="text-muted text-sm">No custom footer icons yet. Add one to take control of the footer icons, or leave this empty to keep the defaults.</p>
        )}
        {!socialLoading && !socialError && socialLinks.length > 0 && (
          <ul className="space-y-3">
            {socialLinks.map((link, idx) => (
              <li key={link.id} className={`rounded-xl border p-4 ${link.isEnabled ? 'border-dark-border' : 'border-dark-border opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-3">
                    <span className="w-9 h-9 rounded-lg bg-dark-border flex items-center justify-center text-muted flex-shrink-0">
                      <SocialPlatformIcon platform={resolvePlatformKey(link.name)} className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-foreground font-semibold">{link.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${link.isEnabled ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                          {link.isEnabled ? 'Shown in footer' : 'Hidden'}
                        </span>
                        <span className="text-xs text-muted">Order {link.displayOrder}</span>
                      </div>
                      <p className="text-sm text-muted font-mono break-all">{link.url}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label={`Move ${link.name} up`}
                        disabled={idx === 0}
                        onClick={() => void moveSocialLink(link, -1)}
                        className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-dark-border disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${link.name} down`}
                        disabled={idx === socialLinks.length - 1}
                        onClick={() => void moveSocialLink(link, 1)}
                        className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-dark-border disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit ${link.name}`}
                        onClick={() => openSocialEdit(link)}
                        className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-dark-border cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${link.name}`}
                        onClick={() => setSocialDeleteTarget(link)}
                        className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-dark-border cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleSocialEnabled(link)}
                      className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${link.isEnabled ? 'border-dark-border text-foreground/80 hover:text-foreground' : 'border-green-500/50 text-green-300 hover:bg-green-500/10'}`}
                    >
                      {link.isEnabled ? 'Hide from footer' : 'Show in footer'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </FadeIn>

      <FadeIn delay={0.2}>
      <Card className="border-yellow-500/30">
        <div className="flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="text-foreground font-bold mb-1">Maintenance Mode</h2>
            <p className="text-muted text-sm mb-4">When enabled, visitors will see a maintenance page. Only admins can access the site.</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setSettings(s => ({ ...s, maintenanceMode: !s.maintenanceMode }))}
                className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${settings.maintenanceMode ? 'bg-yellow-400' : 'bg-dark-border'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings.maintenanceMode ? 'translate-x-6' : ''}`} />
              </div>
              <span className="text-sm text-foreground">{settings.maintenanceMode ? 'Maintenance mode ON' : 'Maintenance mode OFF'}</span>
            </label>
          </div>
        </div>
      </Card>
      </FadeIn>

      <FadeIn delay={0.25}>
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-foreground font-bold flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary-text" />Payment Accounts Management</h2>
          <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4" />Add Account</Button>
        </div>
        <p className="text-muted text-sm mb-4">Receiving accounts students pay into (bank / Easypaisa / JazzCash / wallet). Only active accounts are shown to students, in display order.</p>
        {accountsLoading && <p className="text-muted text-sm">Loading payment accounts…</p>}
        {accountsError && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-red-400">{accountsError}</p>
            <Button size="sm" variant="outline" onClick={() => void loadAccounts()}>Retry</Button>
          </div>
        )}
        {!accountsLoading && !accountsError && accounts.length === 0 && (
          <p className="text-muted text-sm">No payment accounts yet. Add one so students know where to pay.</p>
        )}
        {!accountsLoading && !accountsError && accounts.length > 0 && (
          <ul className="space-y-3">
            {accounts.map((account, idx) => (
              <li key={account.id} className={`rounded-xl border p-4 ${account.isActive ? 'border-dark-border' : 'border-dark-border opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-foreground font-semibold">{account.label}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-dark-border text-foreground/80">{METHOD_LABELS[account.method]}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${account.isActive ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                        {account.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-xs text-muted">Order {account.displayOrder}</span>
                    </div>
                    <p className="text-sm text-foreground/80 mt-1">{account.accountHolder}{account.bankName ? ` · ${account.bankName}` : ''}</p>
                    <p className="text-sm text-muted font-mono break-all">{accountRef(account)}</p>
                    {account.instructions && <p className="text-sm text-muted mt-1">{account.instructions}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label={`Move ${account.label} up`}
                        disabled={idx === 0}
                        onClick={() => void moveAccount(account, -1)}
                        className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-dark-border disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${account.label} down`}
                        disabled={idx === accounts.length - 1}
                        onClick={() => void moveAccount(account, 1)}
                        className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-dark-border disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit ${account.label}`}
                        onClick={() => openEdit(account)}
                        className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-dark-border cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${account.label}`}
                        onClick={() => setDeleteTarget(account)}
                        className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-dark-border cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleActive(account)}
                      className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${account.isActive ? 'border-dark-border text-foreground/80 hover:text-foreground' : 'border-green-500/50 text-green-300 hover:bg-green-500/10'}`}
                    >
                      {account.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </FadeIn>

      <Button onClick={handleSave} loading={saving} size="lg"><Save className="w-4 h-4" />Save Settings</Button>

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit Payment Account' : 'Add Payment Account'} size="lg">
        <div className="space-y-4">
          <Input label="Label *" placeholder="e.g. HBL — Main account" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
          <Select label="Method *" options={METHOD_OPTIONS} value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value as PaymentMethod }))} />
          <Input label="Account Holder *" placeholder="e.g. CodeBettle" value={form.accountHolder} onChange={e => setForm(f => ({ ...f, accountHolder: e.target.value }))} />
          <Input label="Bank / Service Name" placeholder="e.g. HBL" value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
          <Input label="Account Number" placeholder="e.g. 12345678901234" value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} />
          <Input label="IBAN" placeholder="e.g. PK36HABB0000001234567890" value={form.iban} onChange={e => setForm(f => ({ ...f, iban: e.target.value }))} />
          <Input label="Wallet Number" placeholder="e.g. 03001234567" value={form.walletNumber} onChange={e => setForm(f => ({ ...f, walletNumber: e.target.value }))} />
          <Textarea label="Payment Instructions" placeholder="e.g. Send the fee and share the transaction ID" rows={3} value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Display Order" type="number" value={String(form.displayOrder)} onChange={e => setForm(f => ({ ...f, displayOrder: Number(e.target.value) || 0 }))} />
            <label className="flex items-end gap-2 pb-2.5 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 accent-yellow-400" />
              <span className="text-sm text-foreground/80">Active (shown to students)</span>
            </label>
          </div>
          <p className="text-xs text-muted">At least one of account number, IBAN or wallet number is required.</p>
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveForm()} loading={formSaving}>{editing ? 'Save Changes' : 'Add Account'}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete Payment Account">
        <p className="text-sm text-foreground/80">
          Delete <span className="font-semibold text-foreground">{deleteTarget?.label}</span>?
          Past payment submissions keep their saved copy of this account, so payment history is not affected.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button onClick={() => void confirmDelete()} loading={deleting}>Delete</Button>
        </div>
      </Modal>

      <Modal isOpen={socialFormOpen} onClose={() => setSocialFormOpen(false)} title={socialEditing ? 'Edit Footer Social Icon' : 'Add Footer Social Icon'} size="lg">
        <div className="space-y-4">
          <Input label="Icon Name *" placeholder="e.g. LinkedIn" value={socialForm.name} onChange={e => setSocialForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Icon Link *" placeholder="e.g. https://www.linkedin.com/company/codebettle/" value={socialForm.url} onChange={e => setSocialForm(f => ({ ...f, url: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Display Order" type="number" value={String(socialForm.displayOrder)} onChange={e => setSocialForm(f => ({ ...f, displayOrder: Number(e.target.value) || 0 }))} />
            <label className="flex items-end gap-2 pb-2.5 cursor-pointer">
              <input type="checkbox" checked={socialForm.isEnabled} onChange={e => setSocialForm(f => ({ ...f, isEnabled: e.target.checked }))} className="w-4 h-4 accent-yellow-400" />
              <span className="text-sm text-foreground/80">Shown in footer</span>
            </label>
          </div>
          <p className="text-xs text-muted">The icon is fetched automatically from the name (LinkedIn, Instagram, Facebook, GitHub, WhatsApp, Email). The link must be a valid https:// URL or a mailto: address. Only enabled icons appear in the footer.</p>
          {socialForm.name.trim() && (
            <p className="text-xs text-muted flex items-center gap-2">
              Preview:
              <span className="w-9 h-9 rounded-lg bg-dark-border inline-flex items-center justify-center text-muted">
                <SocialPlatformIcon platform={resolvePlatformKey(socialForm.name)} className="w-4 h-4" />
              </span>
              {socialForm.name.trim()}
            </p>
          )}
          {socialFormError && <p className="text-sm text-red-400">{socialFormError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSocialFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveSocialForm()} loading={socialFormSaving}>{socialEditing ? 'Save Changes' : 'Add Icon'}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={socialDeleteTarget !== null} onClose={() => setSocialDeleteTarget(null)} title="Delete Footer Social Icon">
        <p className="text-sm text-foreground/80">
          Delete <span className="font-semibold text-foreground">{socialDeleteTarget?.name}</span>?
          It will no longer appear in the footer. If this was the last custom icon, the footer goes back to its default icons.
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => setSocialDeleteTarget(null)}>Cancel</Button>
          <Button onClick={() => void confirmSocialDelete()} loading={socialDeleting}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
