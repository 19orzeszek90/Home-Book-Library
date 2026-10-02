import React, { useState, useEffect } from 'react';

const API_URL = (import.meta as any).env.VITE_API_URL || '';

const UsersTab: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [resetPasswordFor, setResetPasswordFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/auth/get-session`)
      .then(r => r.json())
      .then(data => {
        if (data.user) setCurrentUserId(data.user.id);
      })
      .catch(() => {});

    fetch(`${API_URL}/api/admin/users`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setUsers(data);
      })
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  const handleRole = async (userId: string, currentRole: string) => {
    if (currentRole === 'admin') return;
    await fetch(`${API_URL}/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: 'admin' } : u));
  };

  const handleBan = async (userId: string, banned: boolean) => {
    if (userId === currentUserId) return;
    await fetch(`${API_URL}/api/admin/users/${userId}/ban`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banned: !banned }),
    });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, banned: !banned } : u));
  };

  const handleDelete = async (userId: string) => {
    if (!window.confirm('Delete this user? Their borrowings will be unlinked.')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}`, { method: 'DELETE' });
      if (res.ok) setUsers(prev => prev.filter(u => u.id !== userId));
      else { const data = await res.json(); alert(data.error || 'Delete failed'); }
    } catch { alert('Delete failed'); }
  };

  const handleResetPassword = async (userId: string) => {
    if (!newPassword || newPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/admin/users/${userId}/reset-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      if (res.ok) {
        alert('Password reset successfully');
        setResetPasswordFor(null);
        setNewPassword('');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to reset password');
      }
    } catch { alert('Failed to reset password'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-brand-accent/20 border-t-brand-accent rounded-full animate-spin"></div></div>;
  if (error) return <div className="text-red-400 text-center py-8">{error}</div>;

  return (
    <div className="flex-grow overflow-auto">
      {users.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-brand-subtle/50 font-mono text-sm uppercase tracking-widest">No users found</p>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-[10px] font-mono uppercase tracking-widest text-brand-subtle border-b border-white/5">
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Role</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const isCurrentUser = u.id === currentUserId;
              const isAdmin = u.role === 'admin';
              return (
                <tr key={u.id} className={`border-b border-white/5 transition-colors ${isCurrentUser ? 'bg-brand-accent/5' : 'hover:bg-white/5'}`}>
                  <td className="p-3 text-sm text-brand-text">
                    {u.name}
                    {isCurrentUser && <span className="ml-2 text-[10px] text-brand-accent font-mono">(you)</span>}
                  </td>
                  <td className="p-3 text-sm text-brand-subtle">{u.email}</td>
                  <td className="p-3">
                    <span className={`text-[10px] font-mono uppercase tracking-widest font-bold ${isAdmin ? 'text-brand-accent' : 'text-brand-subtle'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-3">
                    {u.banned ? (
                      <span className="text-[10px] font-mono uppercase tracking-widest text-red-400">Banned</span>
                    ) : (
                      <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">Active</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {resetPasswordFor === u.id ? (
                      <div className="flex gap-2 justify-end items-center">
                        <input
                          type="text"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="New password (6+ chars)"
                          className="bg-[#0F172A] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-[#F1F5F9] w-40 outline-none focus:border-[#38BDF8]"
                          autoFocus
                        />
                        <button onClick={() => handleResetPassword(u.id)} className="text-[10px] font-mono uppercase tracking-widest bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 px-3 py-1.5 rounded-lg transition-all">
                          Save
                        </button>
                        <button onClick={() => { setResetPasswordFor(null); setNewPassword(''); }} className="text-[10px] font-mono uppercase tracking-widest text-[#64748B] hover:text-[#F1F5F9] px-2 py-1.5 rounded-lg transition-all">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 justify-end">
                        {!isAdmin && !isCurrentUser && (
                          <button onClick={() => handleRole(u.id, u.role)} className="text-[10px] font-mono uppercase tracking-widest bg-slate-800 hover:bg-slate-700 text-brand-text px-3 py-1.5 rounded-lg transition-all">
                            → admin
                          </button>
                        )}
                        {!isCurrentUser && (
                          <button onClick={() => handleBan(u.id, u.banned)} className={`text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all ${u.banned ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600' : 'bg-red-600/20 text-red-400 hover:bg-red-600'}`}>
                            {u.banned ? 'Unban' : 'Ban'}
                          </button>
                        )}
                        <button onClick={() => setResetPasswordFor(u.id)} className="text-[10px] font-mono uppercase tracking-widest bg-amber-600/20 text-amber-400 hover:bg-amber-600 px-3 py-1.5 rounded-lg transition-all">
                          Reset Pwd
                        </button>
                        {!isAdmin && (
                          <button onClick={() => handleDelete(u.id)} className="text-[10px] font-mono uppercase tracking-widest bg-red-600/20 text-red-400 hover:bg-red-600/40 px-3 py-1.5 rounded-lg transition-all">
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default UsersTab;
