
import React, { useState } from 'react';

interface BorrowFormModalProps {
  bookTitle: string;
  bookId: number;
  existingBorrowing?: any;
  onClose: () => void;
  onSaved: () => void;
}

const API_URL = (import.meta as any).env.VITE_API_URL || '';

const BorrowFormModal: React.FC<BorrowFormModalProps> = ({ bookTitle, bookId, existingBorrowing, onClose, onSaved }) => {
  const today = new Date().toISOString().slice(0, 10);
  const defaultDue = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [borrowerName, setBorrowerName] = useState(existingBorrowing?.BorrowerName || '');
  const [phone, setPhone] = useState(existingBorrowing?.Phone || '');
  const [email, setEmail] = useState(existingBorrowing?.Email || '');
  const [borrowDate, setBorrowDate] = useState(existingBorrowing?.BorrowDate || today);
  const [dueDate, setDueDate] = useState(existingBorrowing?.DueDate || defaultDue);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    console.log('handleSave called', { borrowerName, bookId, borrowDate, dueDate });
    if (!borrowerName.trim()) { alert('Name is required'); return; }
    setIsSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/borrowings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, borrowerName: borrowerName.trim(), phone, email, borrowDate, dueDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onSaved();
      onClose();
    } catch (e) {
      alert('Error saving borrowing: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReturn = async () => {
    if (!existingBorrowing?.ID) return;
    setIsSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/borrowings/${existingBorrowing.ID}/return`, { method: 'PUT' });
      if (!res.ok) throw new Error('Return failed');
      onSaved();
      onClose();
    } catch (e) {
      alert('Error returning book');
    } finally {
      setIsSaving(false);
    }
  };

  const inputStyle = "bg-slate-700 p-2 rounded-md w-full border-transparent focus:outline-none focus:ring-2 focus:ring-brand-accent transition-all";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className="bg-brand-secondary rounded-lg shadow-2xl w-full max-w-lg relative p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-2xl font-bold text-brand-subtle hover:text-white leading-none">&times;</button>
        <h2 className="text-xl font-bold text-brand-text mb-1">{existingBorrowing ? 'Edit Borrowing' : 'Borrow Book'}</h2>
        <p className="text-sm text-brand-subtle mb-6 italic">"{bookTitle}"</p>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-mono text-brand-subtle uppercase tracking-widest block mb-1">Full Name *</label>
            <input value={borrowerName} onChange={e => setBorrowerName(e.target.value)} placeholder="John Doe" className={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono text-brand-subtle uppercase tracking-widest block mb-1">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+48 123 456 789" className={inputStyle} />
            </div>
            <div>
              <label className="text-[10px] font-mono text-brand-subtle uppercase tracking-widest block mb-1">Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" className={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono text-brand-subtle uppercase tracking-widest block mb-1">Borrow Date</label>
              <input type="date" value={borrowDate} onChange={e => setBorrowDate(e.target.value)} className={inputStyle} />
            </div>
            <div>
              <label className="text-[10px] font-mono text-brand-subtle uppercase tracking-widest block mb-1">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputStyle} />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          {existingBorrowing ? (
            <>
              <button onClick={handleReturn} disabled={isSaving}
                className="flex-grow bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm uppercase tracking-widest transition-all">
                {isSaving ? '...' : 'Return Book'}
              </button>
              <button onClick={onClose} className="px-6 bg-slate-800 text-brand-subtle rounded-xl hover:bg-slate-700 transition-colors text-sm">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={handleSave} disabled={isSaving}
                className="flex-grow bg-brand-accent text-brand-primary font-bold py-3 rounded-xl text-sm uppercase tracking-widest hover:bg-sky-400 transition-all">
                {isSaving ? 'Saving...' : 'Save Borrowing'}
              </button>
              <button onClick={onClose} className="px-6 bg-slate-800 text-brand-subtle rounded-xl hover:bg-slate-700 transition-colors text-sm">Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BorrowFormModal;
