
import React, { useState, useEffect, useRef } from 'react';
import type { Book } from '../App';
import { TerminalIcon, PlusIcon, TrashIcon, SearchIcon, EditIcon, SparklesIcon } from './Icons';
import { useConfirmation } from '../contexts/ConfirmationContext';

interface QueueItem {
  isbn: string;
  note: string;
  date: string;
}

interface QuickScanModalProps {
  books: Book[];
  onClose: () => void;
  onAddSuccess: () => void;
  onManualEdit: (bookData: Partial<Book>) => void;
}

const API_URL = (import.meta as any).env.VITE_API_URL || '';

type ScanTab = 'scanner' | 'queue';

const QuickScanModal: React.FC<QuickScanModalProps> = ({ books, onClose, onAddSuccess, onManualEdit }) => {
  const [activeTab, setActiveTab] = useState<ScanTab>('scanner');
  const [isbnInput, setIsbnInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastScannedBook, setLastScannedBook] = useState<Book | null>(null);
  const [isDuplicateDetected, setIsDuplicateDetected] = useState(false);
  
  // State for AI Deep Scan
  const [aiDiscoveredBook, setAiDiscoveredBook] = useState<Partial<Book> | null>(null);
  const [isAiScanning, setIsAiScanning] = useState(false);

  // State for handling failed scan notes
  const [pendingUnresolved, setPendingUnresolved] = useState<string | null>(null);
  const [unresolvedNote, setUnresolvedNote] = useState('');

  const [logs, setLogs] = useState<{ msg: string; type: 'info' | 'success' | 'error' | 'ai' }[]>([]);
  const [checkLaterQueue, setCheckLaterQueue] = useState<QueueItem[]>(() => {
    const saved = localStorage.getItem('dev_check_later_queue_v2');
    return saved ? JSON.parse(saved) : [];
  });
  const [bookshelves, setBookshelves] = useState<string[]>([]);
  const [selectedBookshelf, setSelectedBookshelf] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);
  const { showConfirmation } = useConfirmation();

  useEffect(() => {
    localStorage.setItem('dev_check_later_queue_v2', JSON.stringify(checkLaterQueue));
  }, [checkLaterQueue]);

  // Fetch available bookshelves on mount
  useEffect(() => {
    fetch(`${API_URL}/api/bookshelves`)
      .then(r => r.json())
      .then((shelves: string[]) => {
        setBookshelves(shelves);
        if (shelves.length === 1) {
          setSelectedBookshelf(shelves[0]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === 'scanner') {
        if (pendingUnresolved && !isAiScanning && !aiDiscoveredBook) {
            noteInputRef.current?.focus();
        } else {
            inputRef.current?.focus();
        }
    }
  }, [activeTab, pendingUnresolved, isAiScanning, aiDiscoveredBook]);

  const addLog = (msg: string, type: 'info' | 'success' | 'error' | 'ai' = 'info') => {
    setLogs(prev => [{ msg, type }, ...prev].slice(0, 50));
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const isbn = isbnInput.trim();
    if (!isbn) return;

    setIsProcessing(true);
    setIsDuplicateDetected(false);
    setAiDiscoveredBook(null);
    addLog(`Scanning ISBN: ${isbn}...`, 'info');
    setIsbnInput('');

    const cleanIsbn = isbn.replace(/[-\s]/g, '');
    const localDuplicate = books.find(b => b.ISBN?.replace(/[-\s]/g, '') === cleanIsbn);
    
    if (localDuplicate) {
        addLog(`Duplicate detected: ISBN ${isbn} is already in library.`, 'info');
        setLastScannedBook(localDuplicate);
        setIsDuplicateDetected(true);
        setIsProcessing(false);
        return;
    }

    try {
      const response = await fetch(`${API_URL}/api/scan-isbn/${encodeURIComponent(isbn)}`);
      
      // Try to parse logs even on error
      const respData = await response.json().catch(() => ({}));
      if (respData._logs && Array.isArray(respData._logs)) {
        respData._logs.forEach((log: string) => {
          if (log.startsWith('✓')) addLog(log, 'success');
          else if (log.startsWith('✗')) addLog(log, 'error');
          else addLog(log, 'info');
        });
      }
      
      if (!response.ok) {
        throw new Error(respData.error || `HTTP ${response.status}`);
      }
      const data = respData;

      if (data.error) {
        addLog(`ISBN ${isbn} not found. Try manual entry.`, 'error');
        setPendingUnresolved(isbn);
        setIsProcessing(false);
        return;
      }

      addLog(`Found: "${data.title}" (${data.source})`, 'success');

      let safeRating = data.rating !== null && data.rating !== undefined ? Number(data.rating) : undefined;
      if (safeRating !== undefined && safeRating > 5) {
        safeRating = safeRating / 2;
      }
      if (safeRating !== undefined) {
        safeRating = Math.min(5, Math.max(0, safeRating));
      }

      const bookData: Partial<Book> = {
        Title: data.title,
        Author: data.author,
        Publisher: data.publisher,
        "Published Date": data.publishedDate ? String(data.publishedDate).substring(0, 4) : undefined,
        Summary: data.summary,
        ISBN: data.isbn || isbn,
        Pages: data.pages,
        "Image Url": data.imageUrl,
        Rating: safeRating,
        Language: data.language,
        Format: data.format,
        Series: data.series,
        Volume: data.volume,
        Tags: data.tags || '',
        Genres: data.genres || data.category || '',
        "Item Url": data.itemUrl || '',
        BookShelf: selectedBookshelf || (bookshelves.length === 1 ? bookshelves[0] : ''),
        is_wishlist: false,
        "Added Date": new Date().toISOString()
      };

      const saveResponse = await fetch(`${API_URL}/api/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookData),
      });

      if (!saveResponse.ok) throw new Error('Failed to save book');
      
      const savedBook = await saveResponse.json();
      setLastScannedBook(savedBook);
      addLog(`Successfully logged "${data.title}".`, 'success');
      onAddSuccess();

    } catch (err) {
      addLog(`Error processing ${isbn}: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      setPendingUnresolved(isbn);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScraperScan = async () => {
    if (!pendingUnresolved) return;

    setIsAiScanning(true);
    addLog(`Scanning ISBN ${pendingUnresolved} on lubimyczytac.pl...`, 'ai');

    try {
      const response = await fetch(`${API_URL}/api/scan-isbn/${encodeURIComponent(pendingUnresolved)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      addLog(`Found: "${data.title}" (${data.source})`, 'success');

      // Konwersja ratingu z skali 10 na 5 (jeśli potrzebne)
      let safeRating = data.rating !== null && data.rating !== undefined ? Number(data.rating) : undefined;
      if (safeRating !== undefined && safeRating > 5) {
        safeRating = safeRating / 2;
      }
      if (safeRating !== undefined) {
        safeRating = Math.min(5, Math.max(0, safeRating));
      }

      setAiDiscoveredBook({
        Title: data.title,
        Author: data.author,
        Publisher: data.publisher,
        "Published Date": data.publishedDate ? String(data.publishedDate).substring(0, 4) : undefined,
        Summary: data.summary,
        Pages: data.pages,
        "Image Url": data.imageUrl,
        Genres: data.genres || data.category || '',
        Tags: data.tags || '',
        Language: data.language,
        Rating: safeRating,
        Format: data.format,
        Series: data.series,
        Volume: data.volume,
        ISBN: pendingUnresolved,
        "Item Url": data.itemUrl || '',
        "Added Date": new Date().toISOString()
      });
    } catch (err) {
      console.error(err);
      addLog(`Scan failed for ISBN ${pendingUnresolved}: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setIsAiScanning(false);
    }
  };

  const confirmAiDiscovery = async () => {
    if (!aiDiscoveredBook) return;
    
    setIsProcessing(true);
    try {
        const response = await fetch(`${API_URL}/api/books`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(aiDiscoveredBook),
        });
        if (!response.ok) throw new Error('Failed to save AI discovery');
        
        const savedBook = await response.json();
        setLastScannedBook(savedBook);
        addLog(`AI Discovery "${savedBook.Title}" added.`, 'success');
        setAiDiscoveredBook(null);
        setPendingUnresolved(null);
        setUnresolvedNote('');
        onAddSuccess();
    } catch (err) {
        addLog('Error saving AI discovery.', 'error');
    } finally {
        setIsProcessing(false);
    }
  };

  const handleAddToQueue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUnresolved) return;

    const newItem: QueueItem = {
        isbn: pendingUnresolved,
        note: unresolvedNote || 'No description provided',
        date: new Date().toISOString()
    };

    setCheckLaterQueue(prev => [...prev, newItem]);
    addLog(`Stored ${pendingUnresolved} in Review Queue.`, 'info');
    setPendingUnresolved(null);
    setUnresolvedNote('');
    setAiDiscoveredBook(null);
  };

  const handleDeleteLast = async (silent = false) => {
    if (!lastScannedBook || isDuplicateDetected) return;
    
    const executeDelete = async () => {
        try {
          await fetch(`${API_URL}/api/books/${lastScannedBook.ID}`, { method: 'DELETE' });
          if (!silent) addLog(`Reverted log: "${lastScannedBook.Title}".`, 'info');
          setLastScannedBook(null);
          onAddSuccess();
        } catch (err) {
          addLog('Failed to remove entry.', 'error');
        }
    };

    if (silent) {
        await executeDelete();
    } else {
        showConfirmation({
          title: 'Undo Entry?',
          message: `Are you sure you want to remove "${lastScannedBook.Title}"?`,
          confirmText: 'Yes, Remove',
          confirmVariant: 'danger',
          onConfirm: executeDelete
        });
    }
  };

  const handleEditLast = () => {
    if (!lastScannedBook) return;
    onManualEdit(lastScannedBook);
  };

  const handleRemoveFromQueue = (isbn: string) => {
    setCheckLaterQueue(prev => prev.filter(item => item.isbn !== isbn));
  };

  const handleManualAddFromQueue = (item: QueueItem) => {
    onManualEdit({ ISBN: item.isbn, Title: item.note !== 'No description provided' ? item.note : '' });
    handleRemoveFromQueue(item.isbn);
  };

  const clearLogs = () => setLogs([]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex justify-center items-center p-4">
      <div className="bg-brand-primary border border-brand-accent/20 rounded-2xl shadow-[0_0_50px_rgba(56,189,248,0.1)] w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        
        <header className="p-5 bg-brand-secondary/30 border-b border-white/5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <TerminalIcon className="h-6 w-6 text-brand-accent" />
            <h2 className="text-xl font-mono font-bold text-brand-text uppercase tracking-widest">Intelligent ISBN Scanner</h2>
          </div>
          <button onClick={onClose} className="text-2xl font-bold text-brand-subtle hover:text-white leading-none transition-colors">&times;</button>
        </header>

        <div className="flex bg-slate-900/50 border-b border-white/5">
          <button onClick={() => { setActiveTab('scanner'); setPendingUnresolved(null); setAiDiscoveredBook(null); }} className={`px-8 py-4 text-xs font-mono uppercase tracking-widest transition-all relative ${activeTab === 'scanner' ? 'text-brand-accent' : 'text-brand-subtle hover:text-brand-text'}`}>
            Scanner Engine
            {activeTab === 'scanner' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-accent shadow-[0_0_10px_#38bdf8]"></div>}
          </button>
          <button onClick={() => setActiveTab('queue')} className={`px-8 py-4 text-xs font-mono uppercase tracking-widest transition-all relative ${activeTab === 'queue' ? 'text-brand-accent' : 'text-brand-subtle hover:text-brand-text'}`}>
            Review Queue ({checkLaterQueue.length})
            {activeTab === 'queue' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-accent shadow-[0_0_10px_#38bdf8]"></div>}
          </button>
        </div>

        <div className="flex-grow overflow-hidden flex flex-col md:flex-row">
          {activeTab === 'scanner' ? (
            <>
              <div className="w-full md:w-1/2 p-8 flex flex-col border-r border-white/5 overflow-y-auto bg-slate-900/10">
                <div className="flex flex-col space-y-8">
                  
                  {!pendingUnresolved ? (
                    <>
                      <div className="text-center space-y-2">
                        <p className="text-brand-accent/60 font-mono text-[10px] uppercase tracking-[0.3em]">Ready for Serial Input</p>
                        <h3 className="text-2xl font-bold text-brand-text uppercase tracking-tight">Active Scan Protocol</h3>
                      </div>

                      <form onSubmit={handleScan} className="w-full max-sm mx-auto relative">
                        <input
                          ref={inputRef}
                          type="text"
                          value={isbnInput}
                          onChange={(e) => setIsbnInput(e.target.value)}
                          disabled={isProcessing}
                          placeholder="SCAN ISBN..."
                          className="w-full bg-slate-950 border border-brand-accent/20 focus:border-brand-accent text-center text-2xl font-mono p-5 rounded-xl focus:outline-none transition-all placeholder:text-slate-800 shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]"
                          autoFocus
                        />
                        {isProcessing && (
                          <div className="absolute inset-0 bg-black/60 flex justify-center items-center rounded-xl">
                            <div className="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                      </form>
                    </>
                  ) : (
                    <div className="animate-in zoom-in-95 duration-200">
                      {!aiDiscoveredBook ? (
                        <div className="bg-slate-900/50 border border-brand-accent/20 rounded-2xl p-6 space-y-6">
                            <div className="text-center">
                                <span className="text-[10px] font-mono text-brand-accent uppercase font-bold tracking-widest opacity-60">Metadata Resolution Failed</span>
                                <h3 className="text-xl font-mono text-brand-text mt-2 uppercase tracking-wide">{pendingUnresolved}</h3>
                            </div>
                            
                            <div className="flex flex-col gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-mono text-brand-subtle uppercase ml-1 opacity-50">Discovery Clues (Title/Author)</label>
                                    <input
                                        ref={noteInputRef}
                                        type="text"
                                        value={unresolvedNote}
                                        onChange={(e) => setUnresolvedNote(e.target.value)}
                                        placeholder="Add context for AI deep scan..."
                                        className="w-full bg-slate-950 border border-white/10 focus:border-brand-accent p-3 text-sm rounded-lg focus:outline-none transition-all"
                                    />
                                </div>

                                <button 
                                    onClick={handleScraperScan}
                                    disabled={isAiScanning}
                                    className="w-full bg-brand-accent text-brand-primary font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-sky-400 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(56,189,248,0.2)]"
                                >
                                    {isAiScanning ? (
                                        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <SparklesIcon className="h-5 w-5" />
                                    )}
                                    {isAiScanning ? 'SCANNING...' : 'SCAN (OPENLIBRARY + LUBIMYCZYTAC)'}
                                </button>
                                
                                <div className="flex gap-3">
                                    <button onClick={handleAddToQueue} className="flex-grow bg-slate-800 hover:bg-slate-700 text-brand-text py-3 rounded-xl text-xs font-mono uppercase font-bold transition-all">
                                        Queue for later
                                    </button>
                                    <button type="button" onClick={() => { setPendingUnresolved(null); setAiDiscoveredBook(null); }} className="px-5 text-brand-subtle text-xs hover:text-white underline font-mono">
                                        Discard
                                    </button>
                                </div>
                            </div>
                        </div>
                      ) : (
                        <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-2xl p-6 space-y-6 animate-in fade-in duration-300">
                             <div className="text-center">
                                <span className="text-[10px] font-mono text-emerald-500 uppercase font-bold tracking-widest">Identity Discovered</span>
                                <h3 className="text-xl font-bold text-brand-text mt-2 uppercase">{aiDiscoveredBook.Title}</h3>
                            </div>

                            <div className="flex gap-5">
                                <div className="w-24 h-36 flex-shrink-0 bg-slate-900 rounded-lg shadow-xl overflow-hidden border border-white/5">
                                    <img 
                                        src={aiDiscoveredBook["Image Url"] || '/default-cover.svg'} 
                                        alt="Cover" 
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div className="flex-grow space-y-2">
                                    <p className="text-sm font-bold text-brand-accent uppercase font-mono">{aiDiscoveredBook.Author}</p>
                                    {aiDiscoveredBook.Series && (
                                        <p className="text-[11px] text-brand-text uppercase bg-brand-accent/10 px-2 py-0.5 rounded inline-block">
                                            Seria: {aiDiscoveredBook.Series} {aiDiscoveredBook.Volume ? `(T. ${aiDiscoveredBook.Volume})` : ''}
                                        </p>
                                    )}
                                    <p className="text-xs text-brand-subtle opacity-60 uppercase">{aiDiscoveredBook.Publisher}</p>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {aiDiscoveredBook.Genres?.split(',').slice(0, 3).map(g => (
                                            <span key={g} className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">{g.trim()}</span>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-brand-text/50 line-clamp-3 italic leading-relaxed mt-1">{aiDiscoveredBook.Summary || "No summary available."}</p>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button 
                                    onClick={confirmAiDiscovery}
                                    className="flex-grow bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold py-4 rounded-xl text-xs uppercase transition-all shadow-lg shadow-emerald-950/20"
                                >
                                    Log to Database
                                </button>
                                <button 
                                    onClick={() => setAiDiscoveredBook(null)}
                                    className="px-6 bg-slate-800 text-brand-subtle rounded-xl hover:bg-slate-700 transition-colors"
                                >
                                    Retry
                                </button>
                            </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Visual Preview */}
                  {lastScannedBook && !pendingUnresolved && !aiDiscoveredBook ? (
                    <div className={`animate-in fade-in slide-in-from-bottom-4 duration-500 border rounded-2xl p-5 flex gap-5 relative group ${isDuplicateDetected ? 'bg-amber-500/5 border-amber-500/20' : 'bg-brand-accent/5 border-brand-accent/20'}`}>
                        <div className="w-24 h-36 flex-shrink-0 bg-slate-950 rounded-lg shadow-xl overflow-hidden border border-white/5">
                           <img 
                            src={lastScannedBook["Icon Path"] || '/default-cover.svg'} 
                            alt="Cover" 
                            className="w-full h-full object-cover"
                           />
                        </div>
                        <div className="flex-grow flex flex-col justify-between overflow-hidden">
                          <div>
                            <span className={`text-[10px] font-mono uppercase tracking-widest mb-1 block font-bold ${isDuplicateDetected ? 'text-amber-500' : 'text-emerald-500'}`}>
                                {isDuplicateDetected ? 'ENTRY_DUPLICATE' : 'STATUS_SUCCESS'}
                            </span>
                            <h4 className="text-lg font-bold text-brand-text truncate leading-tight uppercase">{lastScannedBook.Title}</h4>
                            <p className="text-xs text-brand-accent font-mono truncate uppercase opacity-80">{lastScannedBook.Author}</p>
                            <p className="text-[10px] text-brand-subtle mt-3 line-clamp-3 italic opacity-60 leading-relaxed">
                              {lastScannedBook.Summary || "No data summary found in system."}
                            </p>
                          </div>
                          <div className="flex gap-5 mt-4">
                             <button onClick={handleEditLast} className="text-[10px] font-mono text-brand-accent font-bold hover:text-white flex items-center gap-2 transition-all uppercase">
                                <EditIcon className="h-3.5 w-3.5" /> Modify
                             </button>
                             {!isDuplicateDetected && (
                                <button onClick={() => handleDeleteLast()} className="text-[10px] font-mono text-red-500/70 hover:text-red-400 flex items-center gap-2 transition-all uppercase">
                                    <TrashIcon className="h-3.5 w-3.5" /> Revert
                                </button>
                             )}
                          </div>
                        </div>
                    </div>
                  ) : !pendingUnresolved && !aiDiscoveredBook && (
                    <div className="h-36 border-2 border-dashed border-white/5 rounded-2xl flex items-center justify-center">
                        <p className="text-slate-800 font-mono text-[10px] uppercase tracking-[0.4em]">Passive Monitoring Mode</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Feed/Logs */}
              <div className="w-full md:w-1/2 bg-slate-950/40 p-6 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] font-mono text-brand-accent uppercase tracking-widest font-bold">Activity Feed</span>
                    <button onClick={clearLogs} className="text-[10px] font-mono text-slate-700 hover:text-brand-subtle underline uppercase tracking-tighter">Clear_Stream</button>
                </div>
                <div className="flex-grow overflow-y-auto font-mono text-[11px] space-y-2 pr-3 scrollbar-thin">
                  {logs.length === 0 ? (
                    <p className="text-slate-800 font-bold uppercase py-4 border-t border-white/5">System online. Monitoring serial interface...</p>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="flex gap-4 border-t border-white/5 pt-2 first:border-0 first:pt-0">
                        <span className="text-slate-700 font-bold tabular-nums">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                        <p className={`flex-grow ${
                            log.type === 'success' ? 'text-emerald-400' :
                            log.type === 'error' ? 'text-red-400' : 
                            log.type === 'ai' ? 'text-brand-accent italic font-bold' :
                            'text-slate-500'
                        }`}>
                            <span className="mr-2 opacity-50">&gt;&gt;</span>
                            {log.msg}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="w-full p-8 overflow-y-auto">
              <div className="flex justify-between items-end mb-8 border-b border-white/5 pb-4">
                <div>
                  <h3 className="text-2xl font-bold text-brand-text uppercase tracking-tight">Review Queue</h3>
                  <p className="text-xs text-brand-subtle font-mono uppercase opacity-50">High-priority manual identification tasks</p>
                </div>
                <span className="bg-brand-accent/10 text-brand-accent px-4 py-1.5 rounded-full text-[10px] font-mono font-bold border border-brand-accent/20 tracking-widest">
                  {checkLaterQueue.length} TASKS_PENDING
                </span>
              </div>
              
              {checkLaterQueue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 opacity-20">
                    <SearchIcon className="h-20 w-20 mb-6" />
                    <p className="text-brand-text font-mono uppercase tracking-[0.5em] text-sm">All Tasks Synchronized</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {checkLaterQueue.map((item) => (
                    <div key={item.isbn} className="bg-slate-900/50 border border-white/5 p-6 rounded-2xl flex flex-col justify-between hover:border-brand-accent/40 transition-all group">
                      <div>
                        <div className="flex justify-between items-start mb-3">
                           <span className="text-[10px] font-mono text-brand-accent uppercase font-bold tracking-widest">ISBN_ENTRY</span>
                           <span className="text-[9px] font-mono text-slate-600">{new Date(item.date).toLocaleDateString()}</span>
                        </div>
                        <p className="text-2xl font-mono font-bold text-brand-text mb-4 tracking-tighter">{item.isbn}</p>
                        
                        <div className="bg-black/30 p-4 rounded-xl border border-white/5 mb-6 group-hover:border-brand-accent/10 transition-colors">
                            <span className="text-[9px] font-mono text-brand-subtle uppercase block mb-1 opacity-50">Context Log:</span>
                            <p className="text-xs text-brand-text/80 italic leading-relaxed">"{item.note}"</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-3">
                        <button onClick={() => handleManualAddFromQueue(item)} className="flex-grow flex items-center justify-center gap-2 bg-brand-accent hover:bg-sky-400 text-brand-primary font-bold py-3.5 rounded-xl text-[10px] uppercase font-mono tracking-widest transition-all shadow-lg shadow-brand-accent/10">
                            <PlusIcon className="h-4 w-4" /> Resolve
                        </button>
                        <button onClick={() => handleRemoveFromQueue(item.isbn)} className="bg-slate-800 hover:bg-red-600/20 text-slate-500 hover:text-red-500 p-3.5 rounded-xl border border-transparent hover:border-red-500/30 transition-all" title="Delete Task">
                            <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="p-4 bg-slate-950 border-t border-white/5 flex justify-between items-center text-[10px] font-mono text-slate-600 uppercase tracking-widest">
           <div className="flex gap-8">
              <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> CORE_ONLINE</span>
              <span className="flex items-center gap-2">BUFFER_ID: {checkLaterQueue.length}</span>
           </div>
           <div className="opacity-40">PROTOCOL_V3.1 // SCRAPER_ENGINE (OpenLibrary + lubimyczytac)</div>
        </footer>
      </div>
    </div>
  );
};

export default QuickScanModal;
