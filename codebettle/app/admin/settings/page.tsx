'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { Save, Globe, Mail, Phone, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState({
    siteName: 'CodeBettle',
    siteDescription: "Pakistan's premier digital institute",
    contactEmail: 'info@codebettle.com',
    phone: '+92 300 1234567',
    address: 'Lahore, Punjab, Pakistan',
    twitter: '',
    linkedin: '',
    github: '',
    instagram: '',
    maintenanceMode: false,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    toast.success('Settings saved successfully!');
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-white">Site Settings</h1>
        <p className="text-muted text-sm mt-1">Configure platform-wide settings</p>
      </div>

      <Card>
        <h2 className="text-white font-bold mb-4 flex items-center gap-2"><Globe className="w-4 h-4 text-primary" />General</h2>
        <div className="space-y-4">
          <Input label="Site Name" value={settings.siteName} onChange={e => setSettings(s => ({ ...s, siteName: e.target.value }))} />
          <Input label="Site Description" value={settings.siteDescription} onChange={e => setSettings(s => ({ ...s, siteDescription: e.target.value }))} />
        </div>
      </Card>

      <Card>
        <h2 className="text-white font-bold mb-4 flex items-center gap-2"><Mail className="w-4 h-4 text-primary" />Contact</h2>
        <div className="space-y-4">
          <Input label="Contact Email" type="email" value={settings.contactEmail} onChange={e => setSettings(s => ({ ...s, contactEmail: e.target.value }))} />
          <Input label="Phone" value={settings.phone} onChange={e => setSettings(s => ({ ...s, phone: e.target.value }))} />
          <Input label="Address" value={settings.address} onChange={e => setSettings(s => ({ ...s, address: e.target.value }))} />
        </div>
      </Card>

      <Card>
        <h2 className="text-white font-bold mb-4">Social Links</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Twitter" placeholder="https://twitter.com/..." value={settings.twitter} onChange={e => setSettings(s => ({ ...s, twitter: e.target.value }))} />
          <Input label="LinkedIn" placeholder="https://linkedin.com/..." value={settings.linkedin} onChange={e => setSettings(s => ({ ...s, linkedin: e.target.value }))} />
          <Input label="GitHub" placeholder="https://github.com/..." value={settings.github} onChange={e => setSettings(s => ({ ...s, github: e.target.value }))} />
          <Input label="Instagram" placeholder="https://instagram.com/..." value={settings.instagram} onChange={e => setSettings(s => ({ ...s, instagram: e.target.value }))} />
        </div>
      </Card>

      <Card className="border-yellow-500/30">
        <div className="flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-yellow-400 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="text-white font-bold mb-1">Maintenance Mode</h2>
            <p className="text-muted text-sm mb-4">When enabled, visitors will see a maintenance page. Only admins can access the site.</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setSettings(s => ({ ...s, maintenanceMode: !s.maintenanceMode }))}
                className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${settings.maintenanceMode ? 'bg-yellow-400' : 'bg-dark-border'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings.maintenanceMode ? 'translate-x-6' : ''}`} />
              </div>
              <span className="text-sm text-white">{settings.maintenanceMode ? 'Maintenance mode ON' : 'Maintenance mode OFF'}</span>
            </label>
          </div>
        </div>
      </Card>

      <Button onClick={handleSave} loading={saving} size="lg"><Save className="w-4 h-4" />Save Settings</Button>
    </div>
  );
}
