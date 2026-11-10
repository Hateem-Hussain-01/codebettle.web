'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import FadeIn from '@/components/ui/FadeIn';
import { Plus, Trash2, Tag } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Coupon } from '@/lib/db/types';

interface CouponsClientProps {
  initialCoupons: Coupon[];
}

export default function CouponsClient({ initialCoupons }: CouponsClientProps) {
  const [couponList, setCouponList] = useState(initialCoupons);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ code: '', type: 'percentage', value: '', maxUses: '', expiresAt: '' });

  const handleCreate = () => {
    if (!form.code.trim() || !form.value || !form.maxUses || !form.expiresAt) { toast.error('All fields required'); return; }
    const coupon: Coupon = {
      id: Date.now().toString(),
      code: form.code.toUpperCase(),
      type: form.type as 'percentage' | 'fixed',
      value: parseFloat(form.value),
      maxUses: parseInt(form.maxUses),
      usedCount: 0,
      expiresAt: form.expiresAt,
      isActive: true,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setCouponList(c => [coupon, ...c]);
    toast.success('Coupon created!');
    setIsOpen(false);
    setForm({ code: '', type: 'percentage', value: '', maxUses: '', expiresAt: '' });
  };

  const toggleActive = (id: string) => {
    setCouponList(cs => cs.map(c => c.id === id ? { ...c, isActive: !c.isActive } : c));
    toast.success('Coupon status updated');
  };

  const deleteCoupon = (id: string) => {
    setCouponList(cs => cs.filter(c => c.id !== id));
    toast.success('Coupon deleted');
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Coupon Codes</h1>
          <p className="text-muted text-sm mt-1">{couponList.length} coupon{couponList.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setIsOpen(true)}><Plus className="w-4 h-4" />Create Coupon</Button>
      </FadeIn>

      <FadeIn delay={0.08} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border bg-dark-border/20">
                {['Code', 'Discount', 'Uses', 'Expires', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left text-muted text-xs py-3 px-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {couponList.map(coupon => (
                <tr key={coupon.id} className="border-b border-dark-border/40 last:border-0 hover:bg-dark-border/10">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-primary" />
                      <span className="text-primary font-mono font-bold text-sm">{coupon.code}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-white text-xs font-medium">
                    {coupon.type === 'percentage' ? `${coupon.value}% off` : `PKR ${coupon.value} off`}
                  </td>
                  <td className="py-3 px-4 text-muted text-xs">{coupon.usedCount} / {coupon.maxUses}</td>
                  <td className="py-3 px-4 text-muted text-xs">{formatDateShort(coupon.expiresAt)}</td>
                  <td className="py-3 px-4">
                    <Badge variant={coupon.isActive ? 'success' : 'muted'}>{coupon.isActive ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleActive(coupon.id)} className={`text-xs px-2 py-1 rounded-lg border cursor-pointer transition-all ${coupon.isActive ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-green-500/30 text-green-400 hover:bg-green-500/10'}`}>
                        {coupon.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => deleteCoupon(coupon.id)} className="text-muted hover:text-red-400 transition-colors p-1 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FadeIn>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Create Coupon Code">
        <div className="space-y-4">
          <Input label="Coupon Code" placeholder="e.g., SAVE20" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
          <Select label="Discount Type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} options={[{ value: 'percentage', label: 'Percentage (%)' }, { value: 'fixed', label: 'Fixed Amount (PKR)' }]} />
          <Input label={form.type === 'percentage' ? 'Discount %' : 'Amount (PKR)'} type="number" placeholder={form.type === 'percentage' ? '0–100' : 'Amount in PKR'} value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
          <Input label="Max Uses" type="number" placeholder="e.g., 100" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} />
          <Input label="Expiry Date" type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button fullWidth onClick={handleCreate}>Create Coupon</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
