
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import BookCard from './components/BookCard';
import BookFormModal from './components/BookFormModal';
import QuickScanModal from './components/QuickScanModal';
import AboutModal from './components/AboutModal';
import BookDetailModal from './components/BookDetailModal';
import ReadingJourneyModal from './components/ReadingJourneyModal';
import CommandCenter from './components/CommandCenter';
import CollectionView from './components/CollectionView';
import BorrowFormModal from './components/BorrowFormModal';
import BackupRestoreModal from './components/BackupRestoreModal';
import ReadingGoalBanner from './components/ReadingGoalBanner';
import ViewSwitcher from './components/ViewSwitcher';
import SortControls, { SortKey, SortDirection } from './components/SortControls';
import SortModal from './components/SortModal';
import AIAssistantModal from './components/AIAssistantModal';
import { PlusIcon, BookOpenIcon, CogIcon, ChartBarIcon, AdjustmentsIcon, SearchIcon, HardDriveIcon, SparklesIcon, TerminalIcon } from './components/Icons';
import { ConfirmationProvider, useConfirmation } from './contexts/ConfirmationContext';

export interface Book {
  ID: number;
  Title: string;
  Author: string;
  Publisher?: string;
  "Published Date"?: string;
  Format?: string;
  Pages?: number | null;
  Series?: string;
  Volume?: number | null;
  Language?: string;
  ISBN?: string;
  "Page Read"?: number | null;
  "Item Url"?: string;
  "Icon Path"?: string;
  "Photo Path"?: string;
  "Image Url"?: string;
  Summary?: string;
  Location?: string;
  Price?: number | null;
  Genres?: string;
  Rating?: number | null;
  "Added Date"?: string;
  "Copy Index"?: number | null;
  Read?: boolean;
  "Started Reading Date"?: string;
  "Finished Reading Date"?: string;
  Favorite?: boolean;
  Comments?: string;
  Tags?: string;
  BookShelf?: string;
  Settings?: string;
  is_wishlist?: boolean;
}

export type GridSize = 'compact' | 'default' | 'cozy';
export type ViewMode = 'library' | 'wishlist' | 'collection' | 'command-center';

const API_URL = (import.meta as any).env.VITE_API_URL || '';

function AppContent() {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  
  const [viewMode, setViewMode] = useState<ViewMode>('library');
  const [gridSize, setGridSize] = useState<GridSize>(() => {
    return (localStorage.getItem('gridSize') as GridSize) || 'default';
  });
  
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isQuickScanModalOpen, setIsQuickScanModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isJourneyModalOpen, setIsJourneyModalOpen] = useState(false);
  const [isBackupRestoreModalOpen, setIsBackupRestoreModalOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [isAddMenuOpen, setAddMenuOpen] = useState(false);
  const [isSettingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [returnToQuickScan, setReturnToQuickScan] = useState(false);

  const [editingBook, setEditingBook] = useState<Book | Partial<Book> | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [borrowModalBook, setBorrowModalBook] = useState<Book | null>(null);
  const [borrowings, setBorrowings] = useState<any[]>([]);

  const [sortBy, setSortBy] = useState<SortKey>(() => (localStorage.getItem('sortBy') as SortKey) || 'Title');
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => (localStorage.getItem('sortDirection') as SortDirection) || 'asc');
  
  const addMenuRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  
  const { showConfirmation } = useConfirmation();

  const fetchBorrowings = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/borrowings/active`);
      if (res.ok) setBorrowings(await res.json());
    } catch (e) {}
  }, []);

  const fetchBooks = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/books`);
      if (!response.ok) throw new Error('Failed to fetch books');
      const data = await response.json();
      setBooks(data);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('gridSize', gridSize);
  }, [gridSize]);

  useEffect(() => {
    localStorage.setItem('sortBy', sortBy);
    localStorage.setItem('sortDirection', sortDirection);
  }, [sortBy, sortDirection]);

  useEffect(() => {
    fetchBooks();
    fetchBorrowings();
  }, [fetchBooks, fetchBorrowings]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) setAddMenuOpen(false);
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) setSettingsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSortChange = (key: SortKey, direction: SortDirection) => {
      setSortBy(key);
      setSortDirection(direction);
  };
  
  const bookCounts = useMemo(() => {
    const libraryCount = books.filter(book => !book.is_wishlist).length;
    const wishlistCount = books.filter(book => book.is_wishlist).length;
    const seriesCount = new Set(books.filter(b => b.Series).map(b => b.Series?.trim().toLowerCase())).size;
    return { libraryCount, wishlistCount, seriesCount };
  }, [books]);

  const libraryBooks = useMemo(() => books.filter(b => !b.is_wishlist), [books]);

  const filteredBooks = useMemo(() => {
    const viewFilteredBooks = books.filter(book => {
        if (viewMode === 'library') return !book.is_wishlist;
        if (viewMode === 'wishlist') return book.is_wishlist;
        if (viewMode === 'collection') return !book.is_wishlist; // Collections usually focus on owned books
        return true;
    });

    const searchFilteredBooks = !searchTerm
        ? viewFilteredBooks
        : viewFilteredBooks.filter(book =>
            (book.Title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (book.Author?.toLowerCase() || '').includes(searchTerm.toLowerCase())
        );

    return [...searchFilteredBooks].sort((a, b) => {
        const valA = a[sortBy];
        const valB = b[sortBy];
        if (valA == null) return 1;
        if (valB == null) return -1;
        
        if (sortBy === 'Rating') {
            return sortDirection === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
        }
        
        let comparison = String(valA).localeCompare(String(valB), undefined, { sensitivity: 'base' });
        return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [books, searchTerm, viewMode, sortBy, sortDirection]);
  
  const gridClasses = useMemo(() => {
    const baseClasses = 'grid grid-cols-2 gap-4 sm:gap-8';
    const sizeMap: Record<GridSize, string> = {
        compact: `${baseClasses} sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8`,
        default: `${baseClasses} sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6`,
        cozy:    `${baseClasses} sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`,
    };
    return sizeMap[gridSize];
  }, [gridSize]);

  const handleOpenFormModal = (book: Book | Partial<Book> | null = null, fromQuickScan = false) => {
    let bookData = book || {};
    if (!book) {
        bookData.is_wishlist = viewMode === 'wishlist';
    }
    setEditingBook(bookData);
    setReturnToQuickScan(fromQuickScan);
    setIsFormModalOpen(true);
    setAddMenuOpen(false);
    if (fromQuickScan) {
      setIsQuickScanModalOpen(false);
    }
  };

  const handleOpenQuickScan = () => {
    setIsQuickScanModalOpen(true);
    setAddMenuOpen(false);
  };

  const handleShowDetails = (book: Book) => {
    setSelectedBook(book);
  };

  const handleDeleteBook = async (id: number) => {
    showConfirmation({
        title: 'Confirm Deletion',
        message: 'Are you sure you want to delete this book?',
        confirmText: 'Delete',
        confirmVariant: 'danger',
        onConfirm: async () => {
            try {
                await fetch(`${API_URL}/api/books/${id}`, { method: 'DELETE' });
                setBooks(books.filter(b => b.ID !== id));
            } catch (err) {
                showConfirmation({ title: 'Error', message: 'Failed to delete book.', confirmText: 'OK' });
            }
        }
    });
  };
  
  const handleMoveToLibrary = async (book: Book) => {
    try {
        const response = await fetch(`${API_URL}/api/books/${book.ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...book, is_wishlist: false }),
        });
        if (!response.ok) throw new Error('Failed to move book');
        await fetchBooks();
        setSelectedBook(null);
    } catch (err) {
        showConfirmation({ title: 'Error', message: 'Failed to move book to library.', confirmText: 'OK' });
    }
  };

  const handleFullBackup = async () => {
    setProcessingStatus('Creating full backup...');
    setIsProcessing(true);
    try {
        const response = await fetch(`${API_URL}/api/books/backup/full`);
        if (!response.ok) throw new Error('Backup failed.');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        showConfirmation({ title: 'Backup Failed', message: 'Backup creation failed.', confirmText: 'OK', confirmVariant: 'danger' });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleFileRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setIsBackupRestoreModalOpen(false);
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('restorefile', file);
    setProcessingStatus('Restoring from backup...');
    setIsProcessing(true);
    try {
        const response = await fetch(`${API_URL}/api/books/restore/full`, { method: 'POST', body: formData });
        if (!response.ok) throw new Error('Restore failed.');
        showConfirmation({ title: 'Restore Complete', message: 'Database successfully restored.', confirmText: 'OK' });
        fetchBooks();
    } catch (err) {
        showConfirmation({ title: 'Restore Failed', message: 'An error occurred during restore.', confirmText: 'OK', confirmVariant: 'danger' });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleFormSave = async () => {
    await fetchBooks();
    setIsFormModalOpen(false);
    if (returnToQuickScan) {
      setIsQuickScanModalOpen(true);
      setReturnToQuickScan(false);
    }
  };

  return (
    <div className="min-h-screen">
      {isProcessing && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[101] flex flex-col justify-center items-center text-center">
            <div className="w-16 h-16 border-4 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin"></div>
            <h2 className="text-2xl font-mono font-bold text-brand-accent mt-6 uppercase tracking-widest">{processingStatus}</h2>
        </div>
      )}

      <header className="bg-slate-950/60 backdrop-blur-xl sticky top-0 z-20 border-b border-white/5">
        <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center flex-shrink-0 group cursor-pointer" onClick={() => setViewMode('library')}>
              <div className="relative">
                <BookOpenIcon className="h-9 w-9 mr-4 text-brand-accent group-hover:scale-110 transition-transform" />
                <div className="absolute inset-0 bg-brand-accent/20 blur-xl rounded-full -z-10"></div>
              </div>
              <div className="hidden md:block">
                <h1 className="text-xl font-mono font-bold text-brand-text uppercase tracking-[0.3em]">Home Library</h1>
                <p className="text-[10px] font-mono text-brand-subtle uppercase tracking-widest opacity-50">Identity Storage Node</p>
              </div>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-6">
              <div 
                className="relative flex items-center group"
                onMouseEnter={() => setIsSearchHovered(true)}
                onMouseLeave={() => setIsSearchHovered(false)}
              >
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-subtle group-hover:text-brand-accent transition-colors z-10" />
                <input
                    type="text"
                    placeholder="QUERY DATABASE..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => setIsSearchExpanded(true)}
                    onBlur={() => !searchTerm && setIsSearchExpanded(false)}
                    className={`bg-slate-900/50 text-brand-text placeholder:text-slate-700 font-mono text-xs pl-10 ${searchTerm ? 'pr-8' : 'pr-3'} py-2 border border-white/5 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-accent/50 transition-all duration-500 ${isSearchExpanded || isSearchHovered || searchTerm ? 'w-48 sm:w-72 bg-slate-900 border-white/10' : 'w-10 sm:w-12 border-transparent bg-transparent'}`}
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-subtle hover:text-white p-1 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              
              <div className="relative" ref={addMenuRef}>
                <button onClick={() => setAddMenuOpen(!isAddMenuOpen)} className="bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent border border-brand-accent/30 p-2.5 rounded-lg transition-all">
                  <PlusIcon className="h-6 w-6" />
                </button>
                {isAddMenuOpen && (
                  <div className="absolute right-0 mt-3 w-56 glass-panel rounded-xl shadow-2xl py-1 z-30 animate-in fade-in slide-in-from-top-2 border-brand-accent/20">
                    <a onClick={handleOpenQuickScan} className="cursor-pointer flex items-center px-4 py-3 text-xs font-mono uppercase tracking-widest text-brand-accent font-bold hover:bg-brand-accent/10 transition-colors">
                      <TerminalIcon className="h-4 w-4 mr-3" /> Quick Scan (ISBN)
                    </a>
                    <div className="border-t border-white/5 mx-2 my-1"></div>
                    <a onClick={() => handleOpenFormModal()} className="cursor-pointer flex items-center px-4 py-3 text-xs font-mono uppercase tracking-widest text-brand-text hover:bg-brand-accent/10 transition-colors">Add Manually</a>
                  </div>
                )}
              </div>

              <div className="relative" ref={settingsMenuRef}>
                <button onClick={() => setSettingsMenuOpen(!isSettingsMenuOpen)} className="p-2.5 bg-slate-900/50 hover:bg-slate-800 text-brand-subtle border border-white/5 rounded-lg transition-all" aria-label="Settings">
                  <CogIcon className="h-6 w-6" />
                </button>
                {isSettingsMenuOpen && (
                   <div className="absolute right-0 mt-3 w-64 glass-panel rounded-xl shadow-2xl py-1 z-30 animate-in fade-in slide-in-from-top-2 border-brand-accent/20">
                    <a onClick={() => { setViewMode('command-center'); setSettingsMenuOpen(false); }} className="cursor-pointer flex items-center px-4 py-3 text-xs font-mono uppercase tracking-widest text-brand-accent font-bold hover:bg-brand-accent/10 transition-colors">
                        <AdjustmentsIcon className="h-4 w-4 mr-3" /> Command Center
                    </a>
                    <div className="border-t border-white/5 mx-2 my-1"></div>
                    <a onClick={() => { setIsBackupRestoreModalOpen(true); setSettingsMenuOpen(false); }} className="cursor-pointer flex items-center px-4 py-3 text-xs font-mono uppercase tracking-widest text-brand-text hover:bg-brand-accent/10 transition-colors">
                      <HardDriveIcon className="h-4 w-4 mr-3 opacity-60" /> Backup & Restore
                    </a>
                    <a onClick={() => { setIsJourneyModalOpen(true); setSettingsMenuOpen(false); }} className="cursor-pointer flex items-center px-4 py-3 text-xs font-mono uppercase tracking-widest text-brand-text hover:bg-brand-accent/10 transition-colors">
                      <ChartBarIcon className="h-4 w-4 mr-3 opacity-60" /> Journey Logs
                    </a>
                    <div className="border-t border-white/5 mx-2 my-1"></div>
                    <a onClick={() => { setIsAboutModalOpen(true); setSettingsMenuOpen(false); }} className="cursor-pointer flex items-center px-4 py-3 text-xs font-mono uppercase tracking-widest text-brand-subtle hover:text-brand-text transition-colors">
                      <BookOpenIcon className="h-4 w-4 mr-3 opacity-60" /> Core Node Info
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </nav>
      </header>
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {viewMode === 'command-center' ? (
            <CommandCenter 
                books={books} 
                onClose={() => setViewMode('library')} 
                onRefresh={fetchBooks}
                onEditBook={(book) => handleOpenFormModal(book)}
            />
        ) : (
            <>
                <div className="flex items-center justify-between border-b border-white/5 mb-8">
                    <div className="flex flex-wrap">
                        <button onClick={() => setViewMode('library')} className={`px-6 py-4 text-xs font-mono uppercase tracking-[0.2em] transition-all relative ${viewMode === 'library' ? 'text-brand-accent' : 'text-brand-subtle hover:text-brand-text'}`}>
                            Library // {bookCounts.libraryCount}
                            {viewMode === 'library' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-accent shadow-[0_0_10px_#38bdf8]"></div>}
                        </button>
                        <button onClick={() => setViewMode('collection')} className={`px-6 py-4 text-xs font-mono uppercase tracking-[0.2em] transition-all relative ${viewMode === 'collection' ? 'text-brand-accent' : 'text-brand-subtle hover:text-brand-text'}`}>
                            Collection // {bookCounts.seriesCount}
                            {viewMode === 'collection' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-accent shadow-[0_0_10px_#38bdf8]"></div>}
                        </button>
                        <button onClick={() => setViewMode('wishlist')} className={`px-6 py-4 text-xs font-mono uppercase tracking-[0.2em] transition-all relative ${viewMode === 'wishlist' ? 'text-brand-accent' : 'text-brand-subtle hover:text-brand-text'}`}>
                            Wishlist // {bookCounts.wishlistCount}
                            {viewMode === 'wishlist' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-accent shadow-[0_0_10px_#38bdf8]"></div>}
                        </button>
                    </div>
                    <div className="flex items-center gap-6">
                        {viewMode !== 'collection' && (
                            <SortControls 
                                sortBy={sortBy} 
                                sortDirection={sortDirection} 
                                onSortChange={handleSortChange}
                                onOpenMobileSort={() => setIsSortModalOpen(true)}
                            />
                        )}
                        <div className="hidden md:flex">
                            <ViewSwitcher currentSize={gridSize} onSizeChange={setGridSize} />
                        </div>
                    </div>
                </div>

                <div className="space-y-12">
                    {viewMode === 'library' && <ReadingGoalBanner books={libraryBooks} />}
                    
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-32 space-y-4">
                            <div className="w-12 h-12 border-2 border-brand-accent/20 border-t-brand-accent rounded-full animate-spin"></div>
                            <p className="font-mono text-xs uppercase tracking-[0.3em] text-brand-accent animate-pulse">Synchronizing Data Node...</p>
                        </div>
                    ) : (viewMode === 'collection' ? (
                        <CollectionView books={libraryBooks} gridSize={gridSize} onBookClick={handleShowDetails} searchTerm={searchTerm} />
                    ) : (
                        filteredBooks.length === 0 ? (
                            <div className="text-center py-32 bg-slate-900/20 border border-white/5 rounded-3xl">
                                <BookOpenIcon className="h-16 w-16 text-slate-800 mx-auto mb-6" />
                                <h2 className="text-xl font-mono font-bold text-brand-text uppercase tracking-widest mb-2">No Records Detected</h2>
                            </div>
                        ) : (
                            <div className={gridClasses}>
                                {filteredBooks.map(book => (
                                    <BookCard key={book.ID} book={book} size={gridSize} onClick={() => handleShowDetails(book)} />
                                ))}
                            </div>
                        )
                    ))}
                </div>
            </>
        )}
      </main>

      {isQuickScanModalOpen && <QuickScanModal books={books} onClose={() => setIsQuickScanModalOpen(false)} onAddSuccess={fetchBooks} onManualEdit={(book) => { handleOpenFormModal(book, true); }} />}
      {isFormModalOpen && <BookFormModal book={editingBook} books={books} onClose={() => { setIsFormModalOpen(false); setEditingBook(null); }} onSave={handleFormSave} />}
      {isAboutModalOpen && <AboutModal onClose={() => setIsAboutModalOpen(false)} />}
      {isJourneyModalOpen && <ReadingJourneyModal books={libraryBooks} onClose={() => setIsJourneyModalOpen(false)} onBookSelect={handleShowDetails}/>}
      {isBackupRestoreModalOpen && <BackupRestoreModal onClose={() => setIsBackupRestoreModalOpen(false)} onExportCSV={() => window.location.href=`${API_URL}/api/books/export`} onFullBackup={handleFullBackup} onRestore={handleFileRestore} />}
      {isAiAssistantOpen && <AIAssistantModal books={books} onClose={() => setIsAiAssistantOpen(false)} onBookSelect={handleShowDetails} />}
      {isSortModalOpen && <SortModal isOpen={isSortModalOpen} onClose={() => setIsSortModalOpen(false)} currentSortBy={sortBy} currentSortDirection={sortDirection} onApplySort={(key, dir) => { handleSortChange(key, dir); setIsSortModalOpen(false); }} />}
      {selectedBook && <BookDetailModal book={selectedBook} onClose={() => setSelectedBook(null)} onEdit={() => { setSelectedBook(null); handleOpenFormModal(selectedBook); }} onDelete={() => { setSelectedBook(null); handleDeleteBook(selectedBook.ID); }} onMoveToLibrary={() => handleMoveToLibrary(selectedBook)} onBorrow={() => setBorrowModalBook(selectedBook)} onReturn={async () => { const b = borrowings.find((x: any) => x.BookID === selectedBook.ID && !x.ReturnedDate); if (b) { await fetch(`${API_URL}/api/borrowings/${b.ID}/return`, { method: 'PUT' }); fetchBorrowings(); setSelectedBook(null); } }} activeBorrowing={borrowings.find((b: any) => b.BookID === selectedBook.ID && !b.ReturnedDate) || null} />}
      {borrowModalBook && <BorrowFormModal bookTitle={borrowModalBook.Title || ''} bookId={borrowModalBook.ID} existingBorrowing={borrowings.find((b: any) => b.BookID === borrowModalBook.ID && !b.ReturnedDate) || null} onClose={() => setBorrowModalBook(null)} onSaved={fetchBorrowings} />}
    </div>
  );
}

const App: React.FC = () => (
  <ConfirmationProvider>
    <AppContent />
  </ConfirmationProvider>
);

export default App;
