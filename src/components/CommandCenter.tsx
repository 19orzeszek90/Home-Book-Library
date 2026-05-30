
import React, { useState, useMemo, useEffect } from 'react';
import type { Book } from '../App';
import { 
  AdjustmentsIcon, 
  SearchIcon, 
  ChevronDownIcon, 
  EditIcon, 
  ChevronUpIcon
} from './Icons';
import Tag from './Tag';
import { useConfirmation } from '../contexts/ConfirmationContext';

interface CommandCenterProps {
  books: Book[];
  onClose: () => void;
  onRefresh: () => void;
  onEditBook: (book: Book) => void;
}

type SortConfig = {
  key: keyof Book | null;
  direction: 'asc' | 'desc' | null;
};

const API_URL = (import.meta as any).env.VITE_API_URL || '';

const CommandCenter: React.FC<CommandCenterProps> = ({ books, onClose, onRefresh, onEditBook }) => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [tableSearch, setTableSearch] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: null });
  const [tab, setTab] = useState<'books' | 'borrowings'>('books');
  const [borrowings, setBorrowings] = useState<any[]>([]);
  const [borrowingsLoaded, setBorrowingsLoaded] = useState(false);
  
  // Bulk Edit States
  const [bulkField, setBulkField] = useState<string>('');
  const [bulkValue, setBulkValue] = useState<string>('');

  const { showConfirmation } = useConfirmation();

  const handleSort = (key: keyof Book) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = null;
      key = null as any;
    }
    setSortConfig({ key, direction });
  };

  const processedBooks = useMemo(() => {
    let result = [...books];

    // 1. Search Filter
    if (tableSearch) {
      const lower = tableSearch.toLowerCase();
      result = result.filter(b => 
        b.Title?.toLowerCase().includes(lower) || 
        b.Author?.toLowerCase().includes(lower) ||
        b.Publisher?.toLowerCase().includes(lower) ||
        b.ISBN?.includes(lower) ||
        b.Series?.toLowerCase().includes(lower) ||
        String(b.ID).includes(lower)
      );
    }

    // 2. Sorting
    if (sortConfig.key && sortConfig.direction) {
      result.sort((a, b) => {
        const valA = a[sortConfig.key!];
        const valB = b[sortConfig.key!];

        if (valA === valB) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;

        let comparison = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else {
          comparison = String(valA).localeCompare(String(valB), 'pl', { sensitivity: 'base' });
        }

        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [books, tableSearch, sortConfig]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === processedBooks.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(processedBooks.map(b => b.ID)));
  };

  const handleBulkUpdate = async () => {
    if (!bulkField || selectedIds.size === 0) return;
    
    setIsProcessing(true);
    try {
        const response = await fetch(`${API_URL}/api/books/bulk`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ids: Array.from(selectedIds),
                updates: { [bulkField]: bulkValue || null }
            })
        });
        if (!response.ok) throw new Error('Bulk update failed');
        onRefresh();
        setSelectedIds(new Set());
        setBulkField('');
        setBulkValue('');
    } catch (err) {
        alert("Błąd podczas aktualizacji masowej.");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    showConfirmation({
        title: 'Potwierdź usunięcie grupowe',
        message: `Czy na pewno chcesz usunąć ${selectedIds.size} książek? Tej operacji nie można cofnąć.`,
        confirmText: 'Usuń bezpowrotnie',
        confirmVariant: 'danger',
        onConfirm: async () => {
            setIsProcessing(true);
            try {
                const response = await fetch(`${API_URL}/api/books`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: Array.from(selectedIds) })
                });
                if (!response.ok) throw new Error('Delete failed');
                onRefresh();
                setSelectedIds(new Set());
            } catch (err) {
                alert("Błąd podczas usuwania.");
            } finally {
                setIsProcessing(false);
            }
        }
    });
  };

  // Load borrowings when tab switches
  const loadBorrowings = async () => {
    if (borrowingsLoaded) return;
    try {
      const res = await fetch(`${API_URL}/api/borrowings/active`);
      if (res.ok) {
        setBorrowings(await res.json());
        setBorrowingsLoaded(true);
      }
    } catch (e) {}
  };
  // Load borrowings once on mount (so count is accurate in the tab header)
  React.useEffect(() => { loadBorrowings(); }, []);

  const handleReturnBorrowing = async (id: number) => {
    try {
      await fetch(`${API_URL}/api/borrowings/${id}/return`, { method: 'PUT' });
      setBorrowings(prev => prev.filter(b => b.ID !== id));
    } catch (e) { alert('Error returning book'); }
  };

  const SortIcon = ({ column }: { column: keyof Book }) => {
    if (sortConfig.key !== column) return <ChevronDownIcon className="h-3 w-3 opacity-20" />;
    return sortConfig.direction === 'asc' ? <ChevronUpIcon className="h-3 w-3 text-brand-accent" /> : <ChevronDownIcon className="h-3 w-3 text-brand-accent" />;
  };

  const Th = ({ label, column, className = "", minWidth = "100px" }: { label: string; column: keyof Book; className?: string; minWidth?: string }) => (
    <th 
      onClick={() => handleSort(column)} 
      style={{ minWidth, resize: 'horizontal', overflow: 'auto' }}
      className={`p-4 cursor-pointer select-none hover:bg-white/5 transition-colors border-r border-white/5 scrollbar-hide ${className}`}
    >
      <div className="flex items-center justify-between gap-2 whitespace-nowrap">
        <span className="truncate">{label}</span>
        <SortIcon column={column} />
      </div>
    </th>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-brand-text uppercase tracking-widest flex items-center gap-3">
            <AdjustmentsIcon className="h-6 w-6 text-brand-accent" />
            Command Center
          </h2>
          <p className="text-[10px] font-mono text-brand-subtle uppercase tracking-widest opacity-60">Advanced Library Management Engine</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-grow sm:w-64">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-subtle" />
                <input 
                    type="text" 
                    placeholder="Filter records..."
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="w-full bg-slate-900 border border-white/5 rounded-lg pl-10 pr-4 py-2 text-xs font-mono focus:border-brand-accent focus:outline-none transition-all"
                />
            </div>
            <button 
                onClick={onClose}
                className="bg-slate-800 hover:bg-slate-700 text-brand-text px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-widest"
            >
                Return
            </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-0 mb-4 bg-slate-900/50 rounded-xl p-1 border border-white/5 self-start">
        <button onClick={() => setTab('books')} className={`px-6 py-2 text-xs font-mono uppercase tracking-widest rounded-lg transition-all ${tab === 'books' ? 'bg-brand-accent text-brand-primary font-bold' : 'text-brand-subtle hover:text-brand-text'}`}>
          📚 Books ({books.length})
        </button>
        <button onClick={() => setTab('borrowings')} className={`px-6 py-2 text-xs font-mono uppercase tracking-widest rounded-lg transition-all ${tab === 'borrowings' ? 'bg-brand-accent text-brand-primary font-bold' : 'text-brand-subtle hover:text-brand-text'}`}>
          📖 Borrowings ({borrowings.length})
        </button>
      </div>

      {/* Bulk Action Bar */}
      {tab === 'books' && selectedIds.size > 0 && (
        <div className="bg-brand-accent/10 border border-brand-accent/30 p-4 rounded-xl mb-6 flex flex-wrap items-center gap-4 animate-in slide-in-from-top-4">
            <div className="flex items-center gap-2 pr-4 border-r border-brand-accent/20">
                <span className="text-xs font-mono font-bold text-brand-accent uppercase tracking-widest">{selectedIds.size} Selected</span>
            </div>

            <div className="flex items-center gap-2">
                <select 
                    value={bulkField} 
                    onChange={(e) => setBulkField(e.target.value)}
                    className="bg-slate-950 border border-brand-accent/20 rounded-lg px-3 py-1.5 text-[10px] font-mono uppercase text-brand-text focus:outline-none"
                >
                    <option value="">Select Parameter to Edit</option>
                    <option value="Language">Język</option>
                    <option value="Format">Format</option>
                    <option value="BookShelf">Półka</option>
                    <option value="Series">Seria</option>
                    <option value="Publisher">Wydawca</option>
                    <option value="Price">Cena</option>
                    <option value="is_wishlist">Mode: Library/Wishlist</option>
                    <option value="Read">Status: Read</option>
                </select>
                
                {bulkField === 'is_wishlist' || bulkField === 'Read' ? (
                    <select 
                        value={bulkValue} 
                        onChange={(e) => setBulkValue(e.target.value)}
                        className="bg-slate-950 border border-brand-accent/20 rounded-lg px-3 py-1.5 text-[10px] font-mono uppercase text-brand-text focus:outline-none"
                    >
                        <option value="true">YES / ON</option>
                        <option value="false">NO / OFF</option>
                    </select>
                ) : (
                    <input 
                        type={bulkField === 'Price' ? 'number' : 'text'} 
                        placeholder="Value..."
                        value={bulkValue}
                        onChange={(e) => setBulkValue(e.target.value)}
                        className="bg-slate-950 border border-brand-accent/20 rounded-lg px-3 py-1.5 text-[10px] font-mono text-brand-text focus:outline-none w-32"
                    />
                )}

                <button 
                    onClick={handleBulkUpdate}
                    disabled={!bulkField || isProcessing}
                    className="bg-brand-accent text-brand-primary font-bold px-4 py-1.5 rounded-lg text-[10px] uppercase tracking-widest hover:bg-sky-400 disabled:opacity-50 transition-all"
                >
                    {isProcessing ? 'Updating...' : 'Apply Update'}
                </button>
            </div>

            <div className="ml-auto flex items-center gap-3">
                <button 
                    onClick={handleBulkDelete}
                    disabled={isProcessing}
                    className="bg-red-600/20 text-red-500 border border-red-500/30 px-4 py-1.5 rounded-lg text-[10px] uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all"
                >
                    Terminate Selection
                </button>
            </div>
        </div>
      )}

      {tab === 'books' && (
      <div className="flex-grow overflow-auto glass-panel rounded-2xl border-white/5 shadow-2xl relative scrollbar-thin">
        <table className="w-full text-left font-mono text-[11px] border-collapse table-fixed">
            <thead className="bg-slate-900/90 sticky top-0 z-10 border-b border-white/10">
                <tr className="text-brand-accent uppercase tracking-widest font-bold">
                    <th className="p-4 w-12 shrink-0">
                        <input 
                            type="checkbox" 
                            checked={selectedIds.size === processedBooks.length && processedBooks.length > 0}
                            onChange={selectAll}
                            className="w-4 h-4 accent-brand-accent rounded"
                        />
                    </th>
                    <th className="p-4 w-12 shrink-0">Icon</th>
                    <Th label="ID" column="ID" minWidth="60px" className="w-16" />
                    <Th label="Title" column="Title" minWidth="200px" />
                    <Th label="Author" column="Author" minWidth="150px" />
                    <Th label="Publisher" column="Publisher" minWidth="120px" />
                    <Th label="Price" column="Price" minWidth="80px" />
                    <Th label="ISBN" column="ISBN" minWidth="120px" />
                    <Th label="Language" column="Language" minWidth="80px" />
                    <Th label="Series" column="Series" minWidth="120px" />
                    <Th label="Format" column="Format" minWidth="100px" />
                    <Th label="Shelf" column="BookShelf" minWidth="100px" />
                    <Th label="Rating" column="Rating" minWidth="80px" />
                    <th className="p-4 text-center w-20 shrink-0">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
                {processedBooks.map(book => (
                    <tr 
                        key={book.ID} 
                        className={`hover:bg-brand-accent/5 transition-colors group ${selectedIds.has(book.ID) ? 'bg-brand-accent/10' : ''}`}
                    >
                        <td className="p-4">
                            <input 
                                type="checkbox" 
                                checked={selectedIds.has(book.ID)}
                                onChange={() => toggleSelect(book.ID)}
                                className="w-4 h-4 accent-brand-accent rounded"
                            />
                        </td>
                        <td className="p-4">
                            <img 
                                src={book['Icon Path'] || '/default-cover.svg'} 
                                alt="" 
                                className="w-8 h-12 object-cover rounded border border-white/10"
                            />
                        </td>
                        <td className="p-4 text-slate-500">{book.ID}</td>
                        <td className="p-4 font-bold text-brand-text truncate">{book.Title}</td>
                        <td className="p-4 text-brand-subtle opacity-70 truncate">{book.Author}</td>
                        <td className="p-4 text-slate-500 truncate">{book.Publisher || '--'}</td>
                        <td className="p-4 text-emerald-500 font-bold">{book.Price != null ? `${book.Price.toFixed(2)}` : '--'}</td>
                        <td className="p-4 text-slate-500 font-mono text-[9px] truncate">{book.ISBN || '--'}</td>
                        <td className="p-4">
                            {book.Language && <span className="text-[9px] bg-slate-800 px-2 py-0.5 rounded text-slate-400">{book.Language}</span>}
                        </td>
                        <td className="p-4 text-slate-500 italic truncate">
                            {book.Series && <span>{book.Series} {book.Volume ? `(T.${book.Volume})` : ''}</span>}
                        </td>
                        <td className="p-4 text-slate-500">{book.Format}</td>
                        <td className="p-4">
                            {book.BookShelf && <Tag name={book.BookShelf} />}
                        </td>
                        <td className="p-4 text-brand-accent">{book.Rating ? `${book.Rating}★` : '--'}</td>
                        <td className="p-4 text-center">
                            <button 
                                onClick={() => onEditBook(book)}
                                className="p-2 text-brand-subtle hover:text-brand-accent hover:bg-brand-accent/10 rounded transition-all"
                            >
                                <EditIcon className="h-4 w-4" />
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
        {processedBooks.length === 0 && (
            <div className="p-20 text-center opacity-20 flex flex-col items-center gap-4">
                <SearchIcon className="h-16 w-16" />
                <p className="font-mono text-xs uppercase tracking-widest">No matching records found in database.</p>
            </div>
        )}
      </div>
      )}

      {tab === 'borrowings' && (
        <div className="flex-grow overflow-auto">
          {borrowings.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-brand-subtle/50 font-mono text-sm uppercase tracking-widest">No active borrowings</p>
            </div>
          ) : (
            <div className="space-y-3">
              {borrowings.map(b => {
                const overdue = !b.ReturnedDate && new Date(b.DueDate) < new Date();
                return (
                  <div key={b.ID} className={`bg-slate-900/50 border ${overdue ? 'border-red-500/30' : 'border-white/5'} p-4 rounded-xl flex items-center justify-between gap-4`}>
                    <div className="flex-grow min-w-0">
                      <p className="text-sm font-bold text-brand-text truncate">{b.Title || `Książka #${b.BookID}`}</p>
                      <p className="text-xs text-brand-accent">{b.Author || ''}</p>
                      <div className="flex gap-4 text-[10px] text-brand-subtle mt-1">
                        <span>👤 {b.BorrowerName}</span>
                        {b.Phone && <span>📞 {b.Phone}</span>}
                        {b.Email && <span>✉️ {b.Email}</span>}
                        <span>📅 {b.BorrowDate?.slice(0,10)} → {b.ReturnedDate?.slice(0,10) || <span className="text-amber-400">{b.DueDate?.slice(0,10)}{overdue ? ' ❗' : ''}</span>}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!b.ReturnedDate && (
                        <button onClick={() => handleReturnBorrowing(b.ID)} className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-500 hover:text-white border border-emerald-500/30 font-bold py-2 px-3 rounded-lg text-[10px] uppercase tracking-widest transition-all">
                          Return
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <footer className="mt-4 flex justify-between items-center text-[10px] font-mono text-slate-600 uppercase tracking-[0.2em]">
          <div className="flex gap-6">
              <span>DB_SIZE: {books.length} ROWS</span>
              <span>FILTERED: {processedBooks.length} ROWS</span>
          </div>
          <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                LIVE_NODE
              </div>
          </div>
      </footer>
    </div>
  );
};

export default CommandCenter;
