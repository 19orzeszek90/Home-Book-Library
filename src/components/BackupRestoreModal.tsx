
import React, { useRef } from 'react';
import { DownloadIcon, UploadIcon, HardDriveIcon } from './Icons';

interface BackupRestoreModalProps {
  onClose: () => void;
  onExportCSV: () => void;
  onFullBackup: () => void;
  onRestore: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({ onClose, onExportCSV, onFullBackup, onRestore }) => {
  const restoreFileRef = useRef<HTMLInputElement>(null);

  const handleTriggerRestore = () => {
    restoreFileRef.current?.click();
  };
  
  const handleExport = () => {
    onExportCSV();
    onClose();
  };

  const handleBackup = () => {
    onFullBackup();
    onClose();
  };

  const ActionButton: React.FC<{ onClick: () => void; icon: React.ReactNode; title: string; desc: string; accent?: string }> = ({ onClick, icon, title, desc, accent = "text-brand-accent" }) => (
    <button onClick={onClick} className="w-full text-left bg-slate-900/50 border border-white/5 hover:border-brand-accent/40 p-5 rounded-2xl flex items-start gap-5 transition-all group overflow-hidden relative">
        <div className="absolute inset-0 bg-brand-accent/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        <div className={`mt-1 ${accent} transition-transform group-hover:scale-110 duration-300`}>{icon}</div>
        <div className="relative z-10">
            <p className="font-mono font-bold text-brand-text uppercase tracking-widest mb-1">{title}</p>
            <p className="text-[10px] font-mono text-brand-subtle uppercase leading-relaxed opacity-70 tracking-tighter">{desc}</p>
        </div>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex justify-center items-center p-4">
      <div className="bg-slate-950 border border-brand-accent/20 rounded-2xl shadow-[0_0_50px_rgba(56,189,248,0.1)] w-full max-w-xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
        
        <header className="p-6 bg-brand-secondary/30 border-b border-white/5 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <HardDriveIcon className="h-6 w-6 text-brand-accent" />
                <h2 className="text-xl font-mono font-bold text-brand-text uppercase tracking-widest">Data Synchronization Node</h2>
            </div>
            <button onClick={onClose} className="text-2xl font-bold text-brand-subtle hover:text-white leading-none">&times;</button>
        </header>
        
        <div className="p-8 space-y-8">
          {/* Backup Section */}
          <div>
            <h3 className="text-[10px] font-mono font-bold text-brand-accent uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brand-accent shadow-[0_0_8px_#38bdf8]"></div>
                Outbound Data Flow
            </h3>
            <div className="space-y-4">
                <ActionButton 
                    onClick={handleExport}
                    icon={<DownloadIcon className="h-7 w-7" />}
                    title="Export_Legacy (CSV)"
                    desc="Lightweight text-based mapping of entities. Optimal for external analytics or legacy platforms."
                />
                <ActionButton 
                    onClick={handleBackup}
                    icon={<DownloadIcon className="h-7 w-7" />}
                    title="Generate_Core_Backup"
                    desc="Universal JSON snapshot including all entity metadata and visual assets. Complete system state."
                />
            </div>
          </div>
          
          <div className="border-t border-white/5 mx-4"></div>

          {/* Restore Section */}
          <div>
            <h3 className="text-[10px] font-mono font-bold text-brand-accent uppercase tracking-[0.3em] mb-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brand-accent shadow-[0_0_8px_#38bdf8]"></div>
                Inbound Data Restore
            </h3>
            <div className="bg-slate-900/50 border border-white/5 p-6 rounded-2xl relative group overflow-hidden">
                <div className="absolute inset-0 bg-brand-accent/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                <p className="text-[10px] font-mono text-brand-subtle uppercase mb-6 tracking-tighter opacity-70 text-center leading-relaxed">
                    Access Core System Snapshots (.json) to re-synchronize node. System will automatically resolve identity overlaps.
                </p>
                <input type="file" ref={restoreFileRef} onChange={onRestore} accept=".json" className="hidden" />
                <button onClick={handleTriggerRestore} className="w-full bg-brand-accent text-brand-primary font-mono font-bold py-4 rounded-xl flex items-center justify-center gap-3 uppercase text-xs tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-brand-accent/10">
                    <UploadIcon className="h-5 w-5" />
                    Initiate_Restore_Sequence
                </button>
            </div>
          </div>
        </div>
        
        <footer className="p-4 bg-slate-950 border-t border-white/5 text-center text-[9px] font-mono text-slate-700 uppercase tracking-widest">
            Protocol: SECURE_SYNC // Storage_Status: Ready
        </footer>
      </div>
    </div>
  );
};

export default BackupRestoreModal;
