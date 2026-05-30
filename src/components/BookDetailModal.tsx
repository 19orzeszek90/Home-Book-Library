
import React, { useEffect } from 'react';
import type { Book } from '../App';
import StarRating from './StarRating';
import { EditIcon, TrashIcon } from './Icons';
import Tag from './Tag';

interface BookDetailModalProps {
  book: Book;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveToLibrary: () => void;
  onBorrow: () => void;
  onReturn: () => void;
  activeBorrowing: any;
}

const BookDetailModal: React.FC<BookDetailModalProps> = ({ book, onClose, onEdit, onDelete, onMoveToLibrary, onBorrow, onReturn, activeBorrowing }) => {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const coverImage = book["Icon Path"] ? book["Icon Path"] : '/default-cover.svg';

  const DetailItem: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => {
    if (value === null || value === undefined || value === '') return null;
    return (
      <div className="border-b border-white/5 py-2">
        <dt className="text-[12px] font-mono font-bold text-brand-accent uppercase tracking-widest opacity-90">{label}</dt>
        <dd className="mt-1 text-sm text-brand-text font-mono leading-relaxed break-words">{value}</dd>
      </div>
    );
  };
  
  const InfoBadge: React.FC<{ label: string; value: boolean | undefined }> = ({ label, value }) => (
    <div className="flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-white/5">
        <span className="text-[10px] font-mono font-bold text-brand-subtle uppercase tracking-widest">{label}</span>
        <div className={`w-2 h-2 rounded-full shadow-[0_0_8px] ${value ? 'bg-green-500 shadow-green-500' : 'bg-red-500 shadow-red-500'}`}></div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex justify-center items-start p-4 overflow-y-auto">
      <div className="bg-slate-950 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-brand-accent/20 w-full max-w-5xl my-8 relative overflow-hidden">
        
        {/* Technical header decoration */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-accent to-transparent opacity-50"></div>
        
        <button onClick={onClose} className="absolute top-4 right-4 text-2xl font-bold text-brand-subtle hover:text-brand-accent leading-none z-10 transition-colors">&times;</button>
        
        <div className="p-8 md:p-12 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mt-4">
          {/* Cover Image Container */}
          <div className="md:col-span-1">
            <div className="relative group">
                <img src={coverImage} alt={`Cover of ${book.Title}`} className="w-full h-auto object-cover rounded-xl shadow-2xl border border-white/10" />
                <div className="absolute -inset-1 bg-brand-accent/10 blur-xl -z-10 group-hover:bg-brand-accent/20 transition-all"></div>
            </div>
            
            <div className="mt-8 space-y-4">
                <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 font-mono text-[10px] space-y-2 opacity-60">
                    <p>&gt; ISBN: {book.ISBN || 'NULL'}</p>
                    <p>&gt; ADDED: {book['Added Date']?.substring(0,10) || 'N/A'}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <InfoBadge label="READ" value={book.Read} />
                    <InfoBadge label="FAV" value={book.Favorite} />
                </div>
            </div>
          </div>

          {/* Book Details */}
          <div className="md:col-span-2 flex flex-col">
            <header className="mb-6">
                <h2 className="text-4xl font-bold text-brand-text tracking-tight uppercase leading-tight">{book.Title}</h2>
                <div className="flex items-center gap-3 mt-2">
                    <p className="text-xl text-brand-accent font-mono tracking-wider">{book.Author}</p>
                    {book.Rating && book.Rating > 0 && (
                      <div className="flex items-center gap-2 bg-brand-accent/10 px-2 py-1 rounded border border-brand-accent/20">
                        <StarRating rating={book.Rating} />
                      </div>
                    )}
                </div>
            </header>

            {book.Summary && (
              <div className="relative bg-slate-900/30 p-5 rounded-2xl border border-white/5">
                <div className="text-[10px] font-mono text-brand-accent uppercase tracking-widest mb-2 opacity-50">// DATA_SUMMARY</div>
                <p className="text-brand-text/90 leading-relaxed text-sm max-h-48 overflow-y-auto pr-4 scrollbar-thin">{book.Summary}</p>
              </div>
            )}
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 mt-8">
                <DetailItem label="Publisher" value={book.Publisher} />
                <DetailItem label="Published Year" value={book['Published Date']} />
                <DetailItem label="Format" value={book.Format} />
                <DetailItem label="Pages" value={book.Pages} />
                <DetailItem label="Page Read" value={book['Page Read']} />
                <DetailItem label="Series" value={book.Series ? `${book.Series}${book.Volume ? ` [VOL_${book.Volume}]` : ''}` : null} />
                <DetailItem label="Shelf" value={book.BookShelf} />
                <DetailItem label="Location" value={book.Location} />
                <DetailItem label="Language" value={book.Language} />
                <DetailItem label="Price" value={book.Price != null ? `${book.Price.toFixed(2)} PLN` : null} />
            </div>
            
            {(book.Tags || book.Genres) && (
                <div className="mt-8 flex flex-wrap gap-2">
                    {book.Genres?.split(',').map(g => g.trim()).filter(Boolean).map(genre => <Tag key={genre} name={genre} />)}
                    {book.Tags?.split(',').map(tag => {
                        const t = tag.trim();
                        if (!t) return null;
                        return <span key={t} className="px-2 py-1 text-[10px] font-mono bg-slate-800 text-slate-300 rounded uppercase border border-white/10">#{t}</span>
                    })}
                </div>
            )}

            {/* Borrowing section */}
            <div className="mt-6 p-4 rounded-xl border border-white/5">
              {activeBorrowing ? (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono text-amber-500 uppercase tracking-widest font-bold">📖 Borrowed</span>
                    <p className="text-sm text-brand-text mt-1">{activeBorrowing.BorrowerName}</p>
                    <p className="text-[10px] text-brand-subtle">📞 {activeBorrowing.Phone || '-'}  ✉️ {activeBorrowing.Email || '-'}</p>
                    <p className="text-[10px] text-brand-subtle">From: {activeBorrowing.BorrowDate?.slice(0,10)}  Due: {activeBorrowing.DueDate?.slice(0,10)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={onBorrow} className="bg-amber-600/20 hover:bg-amber-600 text-amber-500 hover:text-white border border-amber-500/30 font-mono font-bold py-2 px-4 rounded-xl text-[10px] uppercase tracking-widest transition-all">
                      Extend
                    </button>
                    <button onClick={onReturn} className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-500 hover:text-white border border-emerald-500/30 font-mono font-bold py-2 px-4 rounded-xl text-[10px] uppercase tracking-widest transition-all">
                      Return
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-brand-subtle uppercase tracking-widest">📗 Available — not borrowed</span>
                  <button onClick={onBorrow} className="bg-brand-accent/10 hover:bg-brand-accent text-brand-accent hover:text-brand-primary font-mono font-bold py-2 px-4 rounded-xl text-[10px] uppercase tracking-widest transition-all">
                    Borrow
                  </button>
                </div>
              )}
            </div>

            <div className="mt-auto pt-10 flex justify-end items-center gap-4">
              {book.is_wishlist && (
                  <button onClick={onMoveToLibrary} className="bg-green-600 hover:bg-green-500 text-white font-mono font-bold py-3 px-6 rounded-xl transition-all shadow-[0_0_20px_rgba(22,163,74,0.3)] uppercase text-xs tracking-widest">
                      Deploy to Library
                  </button>
              )}
              <button onClick={onEdit} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-brand-text border border-white/10 font-mono font-bold py-3 px-6 rounded-xl transition-all uppercase text-xs tracking-widest">
                <EditIcon className="h-4 w-4" /> Modify
              </button>
              <button onClick={onDelete} className="flex items-center gap-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/30 font-mono font-bold py-3 px-6 rounded-xl transition-all uppercase text-xs tracking-widest">
                <TrashIcon className="h-4 w-4" /> Terminate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookDetailModal;
