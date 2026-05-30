/**
 * Scraper do wyszukiwania książek na lubimyczytac.pl
 * Zastępuje Gemini AI w funkcji Deep Scan.
 * Bez zewnętrznych bibliotek — tylko axios (już jest w projekcie).
 */

import axios from 'axios';

// Prosta pamięć podręczna URL-i LC
const urlCache = new Map();

// ─── OpenLibrary ───

async function lookupOpenLibrary(isbn) {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
  const { data } = await axios.get(url, { timeout: 15000 });
  const key = `ISBN:${isbn}`;
  const book = data[key];
  if (!book) return null;

  return {
    title: book.title || '',
    author: (book.authors || []).map(a => a.name).join(', '),
    publisher: (book.publishers || []).map(p => p.name).join(', '),
    publishDate: book.publish_date || '',
    pages: book.number_of_pages || null,
    subjects: (book.subjects || []).map(s => s.name),
  };
}

// ─── Startpage (wyszukiwarka) ───

async function findLcUrl(isbn, title, author) {
  const cacheKey = `lc_url:${isbn}:${title}`;
  if (urlCache.has(cacheKey)) return urlCache.get(cacheKey);

  const queries = [];

  // Próba 1: po ISBN
  if (isbn) queries.push(`lubimyczytac.pl/ksiazka ${isbn}`);

  // Próba 2: po tytule + autorze
  if (title) {
    const authorSlug = author ? author.split(' ').pop() : '';
    queries.push(`lubimyczytac.pl/ksiazka ${title} ${authorSlug}`);
  }

  for (const query of queries) {
    try {
      const searchUrl = `https://www.startpage.com/sp/search?query=${encodeURIComponent(query)}&language=pl_PL`;
      const { data: html } = await axios.get(searchUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'pl-PL,pl;q=0.9',
        },
      });

      const matches = [...html.matchAll(/href="(https?:\/\/lubimyczytac\.pl\/ksiazka\/\d+\/[^"]+)"/g)];
      if (matches.length > 0) {
        const found = matches[0][1];
        urlCache.set(cacheKey, found);
        return found;
      }
    } catch (e) {
      // próbuj dalej
    }
  }

  urlCache.set(cacheKey, null);
  return null;
}

// ─── Lubimyczytac.pl scrapowanie ───

function extractJSONLD(html) {
  const pattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      if (data['@type'] === 'Book') return data;
    } catch (e) { /* skip */ }
  }
  return null;
}

function extractDetails(html) {
  const details = {};
  const pattern = /<dt>(.*?)<\/dt>\s*<dd>(.*?)<\/dd>/gs;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const key = match[1].replace(/<[^>]+>/g, '').replace(':', '').trim().toLowerCase();
    const value = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (key) details[key] = value;
  }
  return details;
}

async function scrapeLcPage(url) {
  const { data: html } = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  const jsonld = extractJSONLD(html);
  const details = extractDetails(html);

  const result = {};

  // Z JSON-LD
  if (jsonld) {
    result.title = jsonld.name || '';
    result.isbn = jsonld.isbn || '';
    result.pages = jsonld.numberOfPages || null;
    result.language = jsonld.inLanguage || '';
    result.publishDate = jsonld.datePublished || '';
    result.imageUrl = jsonld.image || '';

    if (jsonld.author) {
      const authors = Array.isArray(jsonld.author) ? jsonld.author : [jsonld.author];
      result.author = authors.map(a => a.name).join(', ');
    }

    if (jsonld.aggregateRating) {
      const r = jsonld.aggregateRating;
      result.rating = parseFloat((r.ratingValue || '0').replace(',', '.'));
      result.ratingCount = r.ratingCount || null;
    }

    if (jsonld.isPartOfSeries) {
      result.series = jsonld.isPartOfSeries.name || '';
      result.volume = jsonld.isPartOfSeries.position || null;
    }
  }

  // Data atrybuty (wydawca, kategoria)
  const pubMatch = html.match(/data-ga-book-publishers="([^"]*)"/);
  if (pubMatch) result.publisher = pubMatch[1];

  const catMatch = html.match(/data-ga-book-category="([^"]*)"/);
  if (catMatch) result.category = catMatch[1];

  // Tabela szczegółów (format, tłumacz, oryginał)
  result.format = details['format'] || '';
  result.originalTitle = details['tytuł oryginału'] || '';
  result.translator = details['tłumacz'] || '';

  // Opis
  const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/);
  result.summary = descMatch ? descMatch[1].replace(/&hellip;$/, '…') : '';

  result.url = url;
  return result;
}

// ─── Główna funkcja ───

export async function scanByIsbn(isbn) {
  const cleanIsbn = isbn.replace(/[-\s]/g, '');
  if (cleanIsbn.length < 10) {
    return { error: 'Nieprawidłowy ISBN' };
  }

  // Krok 1: OpenLibrary
  let olData = null;
  try {
    olData = await lookupOpenLibrary(cleanIsbn);
  } catch (e) {
    return { error: 'OpenLibrary niedostępne' };
  }

  if (!olData) {
    return { error: 'Nie znaleziono książki w OpenLibrary' };
  }

  // Krok 2: Szukaj i scrapuj lubimyczytac.pl
  try {
    const lcUrl = await findLcUrl(cleanIsbn, olData.title, olData.author);
    if (lcUrl) {
      const lcData = await scrapeLcPage(lcUrl);

      return {
        title: lcData.title || olData.title,
        author: lcData.author || olData.author,
        publisher: lcData.publisher || olData.publisher,
        publishedDate: lcData.publishDate || olData.publishDate,
        pages: lcData.pages || olData.pages,
        summary: lcData.summary || '',
        isbn: lcData.isbn || cleanIsbn,
        imageUrl: lcData.imageUrl || '',
        rating: lcData.rating || null,
        language: lcData.language || '',
        format: lcData.format || '',
        series: lcData.series || '',
        volume: lcData.volume || null,
        originalTitle: lcData.originalTitle || '',
        translator: lcData.translator || '',
        category: lcData.category || '',
        itemUrl: lcData.url || '',
        source: 'lubimyczytac',
        genres: lcData.category || '',
        tags: '',
      };
    }
  } catch (e) {
    // nie udało się — wróć do OL
  }

  // Fallback: tylko dane z OpenLibrary
  return {
    title: olData.title,
    author: olData.author,
    publisher: olData.publisher,
    publishedDate: olData.publishDate,
    pages: olData.pages,
    summary: '',
    isbn: cleanIsbn,
    imageUrl: '',
    rating: null,
    language: '',
    format: '',
    series: '',
    volume: null,
    originalTitle: '',
    translator: '',
    category: '',
    itemUrl: '',
    source: 'openlibrary',
    genres: '',
    tags: '',
  };
}
