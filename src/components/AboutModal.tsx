
import React, { useEffect } from 'react';
import { BookOpenIcon, GitHubIcon } from './Icons';

interface AboutModalProps {
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const appName = "Home Book Library";
  const appDescription = "A modern web application for personal book cataloging, featuring smart data fetching, CSV import/export, and a persistent library storage system.";

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex justify-center items-center p-4">
      <div className="bg-slate-950 border border-brand-accent/20 rounded-2xl shadow-[0_0_50px_rgba(56,189,248,0.1)] w-full max-w-lg relative overflow-hidden">
        
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-accent to-transparent opacity-50"></div>
        
        <button onClick={onClose} className="absolute top-4 right-4 text-2xl font-bold text-brand-subtle hover:text-brand-accent leading-none z-10">&times;</button>
        
        <div className="p-8 text-center flex flex-col items-center">
            <div className="relative mb-6">
                <BookOpenIcon className="h-16 w-16 text-brand-accent animate-pulse" />
                <div className="absolute inset-0 bg-brand-accent/20 blur-2xl rounded-full -z-10"></div>
            </div>
          
            <h2 className="text-2xl font-mono font-bold text-brand-text uppercase tracking-[0.3em] mb-4">{appName}</h2>
            
            <div className="bg-slate-900/50 border border-white/5 p-6 rounded-xl mb-8">
                <p className="text-brand-subtle text-xs font-mono leading-relaxed uppercase tracking-widest opacity-80">
                    {appDescription}
                </p>
            </div>

            <div className="space-y-4 w-full">
                <a
                  href="https://github.com/19orzeszek90/Home-Book-Library"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 text-brand-accent border border-brand-accent/30 font-mono text-[10px] uppercase font-bold py-3 px-6 rounded-xl transition-all shadow-lg hover:shadow-brand-accent/10"
                >
                  <GitHubIcon className="h-5 w-5" />
                  Source Code // Access Repository
                </a>
                
                <div className="flex justify-center items-center gap-8 mt-4 text-[9px] font-mono text-slate-700 uppercase tracking-[0.4em]">
                    <span>Version 1.5.0</span>
                    <span>Status: Stable</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
