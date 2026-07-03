import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Film, Sparkles, User, Clapperboard, Loader2, Bookmark, Heart, LogOut, LogIn, Settings, Sliders, ChevronDown, ChevronUp, Play, Clock, Star, X } from 'lucide-react';
import type { Movie, SuggestionResponse, MovieDetails } from './types';
import { useStore } from './store';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [movies, setMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  
  const { user, login, logout, toggleFavorite, toggleWatchlist } = useStore();
  
  // Auth state modal
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Active tab state
  const [activeTab, setActiveTab] = useState<'discover' | 'watchlist' | 'favorites' | 'upcoming'>('discover');
  
  // Filters state
  const [filters, setFilters] = useState({
    era: 'any',
    strictness: 'normal',
    language: 'any'
  });
  const [showFilters, setShowFilters] = useState(false);

  // Upcoming movies state
  const [upcomingMovies, setUpcomingMovies] = useState<Movie[]>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);

  useEffect(() => {
    if (activeTab !== 'upcoming' || upcomingMovies.length > 0) return;
    
    const fetchUpcoming = async () => {
      setLoadingUpcoming(true);
      try {
        const res = await fetch('/api/movies/upcoming');
        if (res.ok) {
          const data = await res.json();
          const formatted = data.results.map((m: any) => ({
            title: m.title,
            year: m.release_date ? m.release_date.substring(0, 4) : '',
            genre: '',
            director: '',
            summary: m.overview || '',
            reason: '',
            poster_path: m.poster_path,
            backdrop_path: m.backdrop_path,
            tmdb_id: m.id,
            vote_average: m.vote_average,
            release_date: m.release_date
          }));
          setUpcomingMovies(formatted);
        }
      } catch (e) {
        console.error("Failed to fetch upcoming movies:", e);
      } finally {
        setLoadingUpcoming(false);
      }
    };
    
    fetchUpcoming();
  }, [activeTab, upcomingMovies.length]);

  // Saved movies fetch cache
  const [savedMovies, setSavedMovies] = useState<Record<number, Movie>>({});
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Movie details modal state
  const [selectedMovie, setSelectedMovie] = useState<MovieDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const fetchSavedMovies = async (ids: number[]) => {
    setLoadingSaved(true);
    const newMovies = { ...savedMovies };
    let updated = false;
    await Promise.all(
      ids.map(async (id) => {
        if (!newMovies[id]) {
          try {
            let data: any = null;
            let type: 'movie' | 'tv' = 'movie';
            
            // Try fetching as movie first
            let res = await fetch(`/api/movies/${id}`);
            if (res.ok) {
              data = await res.json();
            } else {
              // Try fetching as TV show
              res = await fetch(`/api/tv/${id}`);
              if (res.ok) {
                data = await res.json();
                type = 'tv';
              }
            }

            if (data) {
              newMovies[id] = {
                title: data.name || data.title,
                year: (data.first_air_date || data.release_date) ? (data.first_air_date || data.release_date).substring(0, 4) : '',
                genre: data.genres ? data.genres.map((g: any) => g.name).join(', ') : '',
                director: type === 'tv' 
                  ? (data.created_by?.[0]?.name || data.networks?.[0]?.name || 'Unknown')
                  : (data.credits?.crew?.find((c: any) => c.job === 'Director')?.name || 'Unknown'),
                summary: data.overview || '',
                reason: 'Saved in your library',
                poster_path: data.poster_path,
                backdrop_path: data.backdrop_path,
                tmdb_id: data.id,
                vote_average: data.vote_average,
                type: type
              };
              updated = true;
            }
          } catch (e) {
            console.error("Failed to fetch details for saved ID:", id);
          }
        }
      })
    );
    if (updated) {
      setSavedMovies(newMovies);
    }
    setLoadingSaved(false);
  };

  useEffect(() => {
    if (!user) return;
    const idsToFetch = activeTab === 'watchlist' ? user.watchlist : activeTab === 'favorites' ? user.favorites : [];
    const missingIds = idsToFetch.filter(id => !savedMovies[id]);
    if (missingIds.length > 0) {
      fetchSavedMovies(missingIds);
    }
  }, [activeTab, user?.watchlist, user?.favorites]);

  const handleOpenDetails = async (movie: Movie) => {
    if (!movie.tmdb_id) return;
    setIsLoadingDetails(true);
    setDetailsError(null);
    setSelectedMovie({
      ...movie,
    });
    
    try {
      const isTv = movie.type === 'tv';
      const endpointPath = isTv ? 'tv' : 'movies';
      const res = await fetch(`/api/${endpointPath}/${movie.tmdb_id}`);
      if (!res.ok) throw new Error("Failed to load details");
      const data = await res.json();
      const providersData = data['watch/providers']?.results?.US?.flatrate || [];
      const watchProviders = providersData.map((p: any) => ({
        name: p.provider_name,
        logo_path: p.logo_path
      }));
      
      setSelectedMovie({
        ...movie,
        runtime: isTv ? data.episode_run_time?.[0] : data.runtime,
        tagline: data.tagline,
        overview: data.overview || movie.summary,
        videos: data.videos,
        credits: data.credits,
        number_of_seasons: data.number_of_seasons,
        watch_providers: watchProviders
      });
    } catch (err: any) {
      setDetailsError("Could not load trailer or movie details.");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim()) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setMovies([]);

    try {
      const response = await fetch('/api/suggest-movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, filters }),
      });

      let data: any = null;
      const text = await response.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (_) {
          // Response was not valid JSON
        }
      }

      if (!response.ok) {
        throw new Error(data?.error || `Server error (Status ${response.status})`);
      }

      if (!data || !data.movies) {
        throw new Error("Invalid response format from server");
      }

      setMovies(data.movies);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = authMode === 'login' 
      ? { email: emailInput, password: passwordInput }
      : { name: nameInput, email: emailInput, password: passwordInput };
      
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }
      
      // Success
      login(data.user);
      setShowAuthModal(false);
      setEmailInput('');
      setPasswordInput('');
      setNameInput('');
      setAuthError(null);
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setPrompt(suggestion);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[#050505] text-white font-sans">
      {/* Ambient background glows */}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent z-0 pointer-events-none"></div>
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="w-full h-full bg-[#1a1a1a] flex items-center justify-center opacity-30">
           <div className="w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/40 via-black to-black"></div>
        </div>
      </div>

      {/* Header */}
      <header className="relative z-10 h-16 px-6 sm:px-10 flex items-center justify-between border-b border-white/10 bg-black/40 backdrop-blur-md shrink-0 w-full">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 text-red-600">
            <Clapperboard className="w-6 h-6" />
            <div className="text-2xl font-black tracking-tighter cursor-pointer" onClick={() => setActiveTab('discover')}>CINE<span className="text-white">MATCH</span></div>
          </div>
          <div className="hidden md:flex gap-6 text-sm font-medium">
            <button 
              onClick={() => setActiveTab('discover')} 
              className={`transition-colors cursor-pointer ${activeTab === 'discover' ? 'text-red-500 font-bold' : 'text-white/60 hover:text-white'}`}
            >
              Discover
            </button>
            <button 
              onClick={() => { if (!user) setShowAuthModal(true); else setActiveTab('watchlist'); }} 
              className={`transition-colors cursor-pointer ${activeTab === 'watchlist' ? 'text-red-500 font-bold' : 'text-white/60 hover:text-white'}`}
            >
              Watchlist
            </button>
            <button 
              onClick={() => { if (!user) setShowAuthModal(true); else setActiveTab('favorites'); }} 
              className={`transition-colors cursor-pointer ${activeTab === 'favorites' ? 'text-red-500 font-bold' : 'text-white/60 hover:text-white'}`}
            >
              Favorites
            </button>
            <button 
              onClick={() => setActiveTab('upcoming')} 
              className={`transition-colors cursor-pointer ${activeTab === 'upcoming' ? 'text-red-500 font-bold' : 'text-white/60 hover:text-white'}`}
            >
              Upcoming
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-white/60 hidden sm:block">Welcome, {user.name}</span>
              <button 
                onClick={() => { logout(); setActiveTab('discover'); }}
                className="w-8 h-8 rounded-full bg-gradient-to-tr from-red-600 to-amber-500 border border-white/20 flex items-center justify-center hover:opacity-80 transition-opacity cursor-pointer"
                title="Logout"
              >
                <LogOut className="w-4 h-4 text-white" />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowAuthModal(true)}
              className="text-sm font-bold bg-white text-black px-4 py-1.5 rounded-full hover:bg-white/90 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-4 pt-8 sm:pt-16 pb-20 max-w-6xl mx-auto w-full">
        
        {/* Mobile Sub-Navigation Tabs */}
        <div className="flex md:hidden gap-6 text-sm font-medium border-b border-white/5 pb-4 mb-6 w-full justify-center">
          <button 
            onClick={() => setActiveTab('discover')} 
            className={`transition-colors cursor-pointer ${activeTab === 'discover' ? 'text-red-500 font-bold border-b-2 border-red-500 pb-1' : 'text-white/60'}`}
          >
            Discover
          </button>
          <button 
            onClick={() => { if (!user) setShowAuthModal(true); else setActiveTab('watchlist'); }} 
            className={`transition-colors cursor-pointer ${activeTab === 'watchlist' ? 'text-red-500 font-bold border-b-2 border-red-500 pb-1' : 'text-white/60'}`}
          >
            Watchlist
          </button>
          <button 
            onClick={() => { if (!user) setShowAuthModal(true); else setActiveTab('favorites'); }} 
            className={`transition-colors cursor-pointer ${activeTab === 'favorites' ? 'text-red-500 font-bold border-b-2 border-red-500 pb-1' : 'text-white/60'}`}
          >
            Favorites
          </button>
          <button 
            onClick={() => setActiveTab('upcoming')} 
            className={`transition-colors cursor-pointer ${activeTab === 'upcoming' ? 'text-red-500 font-bold border-b-2 border-red-500 pb-1' : 'text-white/60'}`}
          >
            Upcoming
          </button>
        </div>

        {activeTab === 'discover' ? (
          <>
            {/* Hero Section */}
            <motion.div 
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`w-full max-w-2xl flex flex-col items-center text-center transition-all duration-700 ${
                hasSearched ? 'mb-12' : 'my-auto'
              }`}
            >
              <motion.div layout className="space-y-2 mb-8">
                <h1 className="text-5xl sm:text-6xl font-black mb-4 leading-[0.9] text-white">
                  FIND YOUR NEXT<br/><span className="text-red-500">OBSESSION</span>
                </h1>
                <p className="text-white/60 text-base leading-relaxed max-w-lg mx-auto text-balance">
                  Describe your perfect movie night. Mood, genre, actors, or even a weirdly specific scenario.
                </p>
              </motion.div>

              {/* Search Box */}
              <motion.form 
                layout
                onSubmit={handleSearch} 
                className="w-full relative group mt-4 flex flex-col items-center"
              >
                <div className="w-full relative bg-white/5 border border-white/10 rounded-full flex items-center p-1.5 shadow-[0_0_30px_rgba(220,38,38,0.05)] backdrop-blur-md transition-all hover:bg-white/10 hover:border-white/20 focus-within:bg-white/10 focus-within:border-white/30 focus-within:shadow-[0_0_40px_rgba(220,38,38,0.15)]">
                  <Search className="w-5 h-5 text-white/40 ml-4 mr-2 hidden sm:block group-focus-within:text-white/80 transition-colors" />
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Search movies..."
                    className="flex-1 bg-transparent border-none outline-none text-white placeholder:text-white/40 px-4 py-3 sm:py-2 text-base sm:text-lg animate-none"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !prompt.trim()}
                    className="bg-white text-black hover:bg-white/90 disabled:bg-white/10 disabled:text-white/30 px-6 py-3 rounded-full font-bold flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] disabled:shadow-none shrink-0 cursor-pointer"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 fill-current text-amber-500" />}
                    <span className="hidden sm:inline">{isLoading ? 'Matching...' : 'Suggest'}</span>
                  </button>
                </div>

                {/* Advanced Settings toggle button */}
                <div className="flex justify-center mt-4">
                  <button 
                    type="button" 
                    onClick={() => setShowFilters(!showFilters)} 
                    className="text-[10px] text-white/50 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer font-extrabold uppercase tracking-widest bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    {showFilters ? 'Hide Filters' : 'Advanced Filters'}
                    {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Advanced Settings panel */}
                <AnimatePresence>
                  {showFilters && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden w-full max-w-lg mt-4 bg-black/60 border border-white/10 rounded-xl p-4 text-left grid grid-cols-1 sm:grid-cols-3 gap-4 backdrop-blur-md z-20"
                    >
                      <div>
                        <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider block mb-1">Release Era</label>
                        <select 
                          value={filters.era} 
                          onChange={(e) => setFilters(prev => ({ ...prev, era: e.target.value }))}
                          className="w-full bg-black/50 border border-white/20 rounded p-2 text-sm text-white focus:outline-none focus:border-red-500 cursor-pointer"
                        >
                          <option value="any">Any Era</option>
                          <option value="2020-2026">2020 - 2026 (New)</option>
                          <option value="2010s">2010s</option>
                          <option value="2000s">2000s</option>
                          <option value="90s">1990s</option>
                          <option value="80s-older">1980s & Older</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider block mb-1">Strictness</label>
                        <select 
                          value={filters.strictness} 
                          onChange={(e) => setFilters(prev => ({ ...prev, strictness: e.target.value }))}
                          className="w-full bg-black/50 border border-white/20 rounded p-2 text-sm text-white focus:outline-none focus:border-red-500 cursor-pointer"
                        >
                          <option value="normal">Normal Fit</option>
                          <option value="high">High Precision</option>
                          <option value="creative">Creative Matches</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider block mb-1">Language</label>
                        <select 
                          value={filters.language} 
                          onChange={(e) => setFilters(prev => ({ ...prev, language: e.target.value }))}
                          className="w-full bg-black/50 border border-white/20 rounded p-2 text-sm text-white focus:outline-none focus:border-red-500 cursor-pointer"
                        >
                          <option value="any">Any Language</option>
                          <option value="english">English Only</option>
                          <option value="foreign">Foreign / Intl</option>
                        </select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.form>

              {/* Quick Suggestions - fade out when searching */}
              <AnimatePresence>
                {!hasSearched && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    className="mt-8 flex flex-wrap justify-center gap-3"
                  >
                    {[
                      "Cozy autumn mystery",
                      "Psychological sci-fi",
                      "Feel-good 90s romcom",
                      "Time-bending thriller"
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Suggestions Results Section */}
            <div className="w-full">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-red-950/50 border border-red-900/50 text-red-200 rounded-xl max-w-2xl mx-auto text-center"
                >
                  {error}
                </motion.div>
              )}

              {isLoading && !movies.length && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 w-full max-w-5xl mx-auto">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="relative bg-[#111] border border-white/5 rounded-lg p-6 h-[340px] animate-pulse flex flex-col overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80 z-0"></div>
                      <div className="relative z-10 flex flex-col h-full">
                        <div className="h-8 bg-white/10 rounded w-3/4 mb-4" />
                        <div className="h-4 bg-white/5 rounded w-1/4 mb-6" />
                        <div className="flex-1" />
                        <div className="h-4 bg-white/10 rounded w-full mb-2" />
                        <div className="h-4 bg-white/5 rounded w-5/6" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <AnimatePresence mode="popLayout">
                {movies.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 w-full max-w-5xl mx-auto"
                  >
                    {movies.map((movie, index) => (
                      <motion.div
                        key={movie.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="relative rounded-lg overflow-hidden border border-white/10 bg-[#111] shadow-2xl flex flex-col group transition-transform hover:scale-[1.01] duration-300 min-h-[340px] cursor-pointer"
                        onClick={() => handleOpenDetails(movie)}
                      >
                        {/* Background Poster Cover */}
                        {movie.backdrop_path && (
                          <div 
                            className="absolute inset-0 z-0 opacity-20 pointer-events-none group-hover:opacity-30 transition-opacity duration-500" 
                            style={{ 
                              backgroundImage: `url(https://image.tmdb.org/t/p/w780${movie.backdrop_path})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }}
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/80 to-black/95 z-0 pointer-events-none"></div>
                        <div className="absolute inset-0 bg-[#222] z-[-1] pointer-events-none"></div>
                        
                        <div className="relative z-10 p-6 flex flex-col h-full">
                          <div className="flex justify-between items-start mb-2 gap-4">
                            <div className="flex gap-4 items-start">
                              {movie.poster_path && (
                                <img 
                                  src={`https://image.tmdb.org/t/p/w154${movie.poster_path}`} 
                                  alt={`${movie.title} poster`}
                                  className="w-16 sm:w-20 rounded shadow-lg border border-white/10 shrink-0"
                                />
                              )}
                              <div>
                                <h3 className="font-black text-2xl uppercase tracking-tighter leading-none text-white group-hover:text-red-500 transition-colors mb-2">
                                  {movie.title}
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                  <span className="border border-white/20 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase text-white/70 bg-black/50 shrink-0">
                                    {movie.year}
                                  </span>
                                  {movie.vote_average ? (
                                    <span className="border border-amber-500/30 text-amber-500 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase bg-amber-500/10 shrink-0">
                                      ★ {movie.vote_average.toFixed(1)}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            
                            {/* Action Buttons */}
                            <div className="flex flex-col gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button 
                                onClick={() => {
                                  if (!user) setShowAuthModal(true);
                                  else if (movie.tmdb_id) toggleWatchlist(movie.tmdb_id);
                                }}
                                className={`p-2 rounded-full border transition-colors cursor-pointer ${
                                  user?.watchlist.includes(movie.tmdb_id!) 
                                    ? 'bg-indigo-500 border-indigo-500 text-white' 
                                    : 'bg-black/50 border-white/20 text-white/60 hover:text-white hover:border-white/50'
                                }`}
                                title="Add to Watchlist"
                              >
                                <Bookmark className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => {
                                  if (!user) setShowAuthModal(true);
                                  else if (movie.tmdb_id) toggleFavorite(movie.tmdb_id);
                                }}
                                className={`p-2 rounded-full border transition-colors cursor-pointer ${
                                  user?.favorites.includes(movie.tmdb_id!) 
                                    ? 'bg-red-500 border-red-500 text-white' 
                                    : 'bg-black/50 border-white/20 text-white/60 hover:text-white hover:border-white/50'
                                }`}
                                title="Favorite"
                              >
                                <Heart className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-white/50 mb-4 mt-4">
                            <div className="flex items-center gap-1">
                              <Film className="w-3 h-3 text-red-500" />
                              <span className="text-white/70">{movie.genre}</span>
                            </div>
                            <div className="w-1 h-1 rounded-full bg-white/20" />
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3 text-white/40" />
                              {movie.director}
                            </div>
                          </div>

                          <p className="text-white/60 text-sm leading-relaxed mb-6 flex-1 line-clamp-3">
                            {movie.summary}
                          </p>

                          <div className="bg-white/5 border border-white/10 rounded-md p-4 mt-auto backdrop-blur-sm group-hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="px-2 py-0.5 bg-red-600 text-[10px] font-bold rounded uppercase tracking-widest text-white shadow-[0_0_10px_rgba(220,38,38,0.5)]">
                                Why it matches
                              </span>
                            </div>
                            <p className="text-xs text-white/70 italic leading-relaxed line-clamp-2">
                              "{movie.reason}"
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        ) : activeTab === 'upcoming' ? (
          /* Upcoming Movies View */
          <div className="w-full">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-black uppercase tracking-tight">
                Upcoming Releases
              </h2>
              <p className="text-white/60 text-sm mt-2">
                Highly anticipated movies scheduled to hit theatres and streaming soon.
              </p>
            </div>
            
            {loadingUpcoming ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-red-500" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl mx-auto">
                {upcomingMovies.map((movie) => (
                  <div
                    key={movie.tmdb_id}
                    className="relative rounded-lg overflow-hidden border border-white/10 bg-[#111] shadow-2xl flex flex-col group transition-transform hover:scale-[1.01] duration-300 min-h-[340px] cursor-pointer"
                    onClick={() => handleOpenDetails(movie)}
                  >
                    {/* Background Poster Cover */}
                    {movie.backdrop_path && (
                      <div 
                        className="absolute inset-0 z-0 opacity-20 pointer-events-none group-hover:opacity-30 transition-opacity duration-500" 
                        style={{ 
                          backgroundImage: `url(https://image.tmdb.org/t/p/w780${movie.backdrop_path})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/80 to-black/95 z-0 pointer-events-none"></div>
                    <div className="absolute inset-0 bg-[#222] z-[-1] pointer-events-none"></div>
                    
                    <div className="relative z-10 p-6 flex flex-col h-full">
                      <div className="flex justify-between items-start mb-2 gap-4">
                        <div className="flex gap-4 items-start">
                          {movie.poster_path && (
                            <img 
                              src={`https://image.tmdb.org/t/p/w154${movie.poster_path}`} 
                              alt={`${movie.title} poster`}
                              className="w-16 sm:w-20 rounded shadow-lg border border-white/10 shrink-0"
                            />
                          )}
                          <div>
                            <h3 className="font-black text-2xl uppercase tracking-tighter leading-none text-white group-hover:text-red-500 transition-colors mb-2">
                              {movie.title}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {movie.release_date && (
                                <span className="border border-red-500/30 text-red-500 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase bg-red-500/10 shrink-0">
                                  Release: {movie.release_date}
                                </span>
                              )}
                              {movie.vote_average ? (
                                <span className="border border-amber-500/30 text-amber-500 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase bg-amber-500/10 shrink-0">
                                  ★ {movie.vote_average.toFixed(1)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex flex-col gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button 
                            onClick={() => {
                              if (!user) setShowAuthModal(true);
                              else if (movie.tmdb_id) toggleWatchlist(movie.tmdb_id);
                            }}
                            className={`p-2 rounded-full border transition-colors cursor-pointer ${
                              user?.watchlist.includes(movie.tmdb_id!) 
                                ? 'bg-indigo-500 border-indigo-500 text-white' 
                                : 'bg-black/50 border-white/20 text-white/60 hover:text-white hover:border-white/50'
                            }`}
                            title="Add to Watchlist"
                          >
                            <Bookmark className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => {
                              if (!user) setShowAuthModal(true);
                              else if (movie.tmdb_id) toggleFavorite(movie.tmdb_id);
                            }}
                            className={`p-2 rounded-full border transition-colors cursor-pointer ${
                              user?.favorites.includes(movie.tmdb_id!) 
                                ? 'bg-red-500 border-red-500 text-white' 
                                : 'bg-black/50 border-white/20 text-white/60 hover:text-white hover:border-white/50'
                            }`}
                            title="Favorite"
                          >
                            <Heart className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <p className="text-white/60 text-sm leading-relaxed mb-6 flex-1 line-clamp-4 mt-4">
                        {movie.summary || "No overview available yet."}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Watchlist & Favorites view tabs */
          <div className="w-full">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-black uppercase tracking-tight">
                {activeTab === 'watchlist' ? 'My Watchlist' : 'My Favorites'}
              </h2>
              <p className="text-white/60 text-sm mt-2">
                {activeTab === 'watchlist' ? 'Movies you want to watch' : 'Your all-time favorite movies'}
              </p>
            </div>
            
            {loadingSaved ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-red-500" />
              </div>
            ) : (
              <>
                {(() => {
                  const ids = activeTab === 'watchlist' ? user?.watchlist || [] : user?.favorites || [];
                  const savedList = ids.map(id => savedMovies[id]).filter(Boolean);
                  
                  if (savedList.length === 0) {
                    return (
                      <div className="text-center py-20 border border-dashed border-white/10 rounded-xl bg-white/5 max-w-md mx-auto">
                        <Film className="w-12 h-12 text-white/20 mx-auto mb-4" />
                        <p className="text-white/40 font-medium">No movies saved here yet.</p>
                        <button 
                          onClick={() => setActiveTab('discover')} 
                          className="mt-4 bg-white text-black font-bold px-6 py-2 rounded-full hover:bg-white/90 text-sm cursor-pointer"
                        >
                          Discover Movies
                        </button>
                      </div>
                    );
                  }
                  
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl mx-auto">
                      {savedList.map((movie) => (
                        <div
                          key={movie.tmdb_id}
                          className="relative rounded-lg overflow-hidden border border-white/10 bg-[#111] shadow-2xl flex flex-col group transition-transform hover:scale-[1.01] duration-300 min-h-[340px] cursor-pointer"
                          onClick={() => handleOpenDetails(movie)}
                        >
                          {/* Background Poster Cover */}
                          {movie.backdrop_path && (
                            <div 
                              className="absolute inset-0 z-0 opacity-20 pointer-events-none group-hover:opacity-30 transition-opacity duration-500" 
                              style={{ 
                                backgroundImage: `url(https://image.tmdb.org/t/p/w780${movie.backdrop_path})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                              }}
                            />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/80 to-black/95 z-0 pointer-events-none"></div>
                          <div className="absolute inset-0 bg-[#222] z-[-1] pointer-events-none"></div>
                          
                          <div className="relative z-10 p-6 flex flex-col h-full">
                            <div className="flex justify-between items-start mb-2 gap-4">
                              <div className="flex gap-4 items-start">
                                {movie.poster_path && (
                                  <img 
                                    src={`https://image.tmdb.org/t/p/w154${movie.poster_path}`} 
                                    alt={`${movie.title} poster`}
                                    className="w-16 sm:w-20 rounded shadow-lg border border-white/10 shrink-0"
                                  />
                                )}
                                <div>
                                  <h3 className="font-black text-2xl uppercase tracking-tighter leading-none text-white group-hover:text-red-500 transition-colors mb-2">
                                    {movie.title}
                                  </h3>
                                  <div className="flex flex-wrap gap-2">
                                    <span className="border border-white/20 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase text-white/70 bg-black/50 shrink-0">
                                      {movie.year}
                                    </span>
                                    {movie.vote_average ? (
                                      <span className="border border-amber-500/30 text-amber-500 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase bg-amber-500/10 shrink-0">
                                        ★ {movie.vote_average.toFixed(1)}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Action Buttons */}
                              <div className="flex flex-col gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button 
                                  onClick={() => {
                                    if (movie.tmdb_id) toggleWatchlist(movie.tmdb_id);
                                  }}
                                  className={`p-2 rounded-full border transition-colors cursor-pointer ${
                                    user?.watchlist.includes(movie.tmdb_id!) 
                                      ? 'bg-indigo-500 border-indigo-500 text-white' 
                                      : 'bg-black/50 border-white/20 text-white/60 hover:text-white hover:border-white/50'
                                  }`}
                                  title="Add to Watchlist"
                                >
                                  <Bookmark className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => {
                                    if (movie.tmdb_id) toggleFavorite(movie.tmdb_id);
                                  }}
                                  className={`p-2 rounded-full border transition-colors cursor-pointer ${
                                    user?.favorites.includes(movie.tmdb_id!) 
                                      ? 'bg-red-500 border-red-500 text-white' 
                                      : 'bg-black/50 border-white/20 text-white/60 hover:text-white hover:border-white/50'
                                  }`}
                                  title="Favorite"
                                >
                                  <Heart className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-white/50 mb-4 mt-4">
                              <div className="flex items-center gap-1">
                                <Film className="w-3 h-3 text-red-500" />
                                <span className="text-white/70">{movie.genre}</span>
                              </div>
                              <div className="w-1 h-1 rounded-full bg-white/20" />
                              <div className="flex items-center gap-1">
                                <User className="w-3 h-3 text-white/40" />
                                {movie.director}
                              </div>
                            </div>

                            <p className="text-white/60 text-sm leading-relaxed mb-6 flex-1 line-clamp-3">
                              {movie.summary}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </main>

      {/* Movie Details Modal */}
      <AnimatePresence>
        {selectedMovie && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111] border border-white/10 rounded-xl p-6 sm:p-8 w-full max-w-3xl shadow-2xl relative my-8"
            >
              <button 
                onClick={() => setSelectedMovie(null)}
                className="absolute top-4 right-4 text-white/40 hover:text-white p-2 cursor-pointer bg-white/5 hover:bg-white/10 rounded-full transition-colors z-30"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-tighter leading-none text-white mb-2">
                    {selectedMovie.title}
                  </h2>
                  {selectedMovie.tagline && (
                    <p className="text-red-500 text-sm font-semibold italic mb-3">"{selectedMovie.tagline}"</p>
                  )}
                  <div className="flex flex-wrap gap-3 items-center text-xs text-white/60">
                    <span className="bg-white/10 px-2 py-1 rounded font-bold">{selectedMovie.year}</span>
                    {selectedMovie.type === 'tv' && selectedMovie.number_of_seasons ? (
                      <span className="bg-red-500/20 text-red-500 px-2 py-0.5 rounded font-bold text-[10px] tracking-wider uppercase">
                        {selectedMovie.number_of_seasons} {selectedMovie.number_of_seasons === 1 ? 'Season' : 'Seasons'}
                      </span>
                    ) : selectedMovie.runtime ? (
                      <span className="flex items-center gap-1 font-bold">
                        <Clock className="w-4 h-4 text-red-500" /> {selectedMovie.runtime} min
                      </span>
                    ) : null}
                    {selectedMovie.vote_average ? (
                      <span className="flex items-center gap-1 text-amber-500 font-bold">
                        <Star className="w-4 h-4 fill-current" /> ★ {selectedMovie.vote_average.toFixed(1)}
                      </span>
                    ) : null}
                    <span className="text-white/40">{selectedMovie.type === 'tv' ? 'Created by' : 'Directed by'} {selectedMovie.director}</span>
                  </div>
                </div>

                {/* Video or Image section */}
                {(() => {
                  const trailer = selectedMovie.videos?.results?.find(
                    (v: any) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")
                  );
                  
                  if (isLoadingDetails) {
                    return (
                      <div className="w-full aspect-video rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                      </div>
                    );
                  }
                  
                  if (trailer) {
                    return (
                      <iframe
                        src={`https://www.youtube.com/embed/${trailer.key}`}
                        title={`${selectedMovie.title} trailer`}
                        className="w-full aspect-video rounded-lg border border-white/10 bg-black"
                        allowFullScreen
                      />
                    );
                  }
                  
                  if (selectedMovie.backdrop_path) {
                    return (
                      <img 
                        src={`https://image.tmdb.org/t/p/w780${selectedMovie.backdrop_path}`} 
                        alt={selectedMovie.title}
                        className="w-full aspect-video rounded-lg object-cover border border-white/10"
                      />
                    );
                  }
                  
                  return null;
                })()}

                {/* Summary and Cast */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2">
                    <h4 className="text-xs uppercase font-bold text-white/40 tracking-wider mb-2">Overview</h4>
                    <p className="text-white/70 text-sm leading-relaxed mb-4">
                      {selectedMovie.overview || selectedMovie.summary}
                    </p>
                    {selectedMovie.reason && selectedMovie.reason !== 'Saved in your library' && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-red-500 block mb-1">Why it matched:</span>
                        <p className="text-xs text-white/80 italic leading-relaxed">"{selectedMovie.reason}"</p>
                      </div>
                    )}
                    
                    {selectedMovie.watch_providers && selectedMovie.watch_providers.length > 0 && (
                      <div className="mt-4 bg-white/5 border border-white/10 rounded-lg p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 block mb-3">Available to Stream On</span>
                        <div className="flex flex-wrap gap-2.5">
                          {selectedMovie.watch_providers.map((provider) => (
                            <div key={provider.name} className="flex items-center gap-2 bg-black/40 border border-white/5 rounded-full pl-1.5 pr-3 py-1 text-xs text-white/80 font-medium select-none">
                              {provider.logo_path ? (
                                <img 
                                  src={`https://image.tmdb.org/t/p/original${provider.logo_path}`} 
                                  alt={provider.name} 
                                  className="w-5 h-5 rounded-full object-cover"
                                />
                              ) : null}
                              {provider.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs uppercase font-bold text-white/40 tracking-wider mb-3">Top Cast</h4>
                    {isLoadingDetails ? (
                      <div className="space-y-2">
                        {[1,2,3].map(i => <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />)}
                      </div>
                    ) : selectedMovie.credits?.cast && selectedMovie.credits.cast.length > 0 ? (
                      <div className="space-y-3">
                        {selectedMovie.credits.cast.slice(0, 4).map((actor) => (
                          <div key={actor.name} className="flex items-center gap-3">
                            {actor.profile_path ? (
                              <img 
                                src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`} 
                                alt={actor.name} 
                                className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white/40 shrink-0">N/A</div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate">{actor.name}</p>
                              <p className="text-[10px] text-white/50 truncate">{actor.character}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-white/40">No cast information available.</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111] border border-white/10 rounded-xl p-8 w-full max-w-sm shadow-2xl relative"
            >
              <button 
                onClick={() => {
                  setShowAuthModal(false);
                  setAuthError(null);
                  setEmailInput('');
                  setPasswordInput('');
                  setNameInput('');
                }}
                className="absolute top-4 right-4 text-white/40 hover:text-white cursor-pointer w-7 h-7 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                &times;
              </button>
              
              <h2 className="text-2xl font-black mb-1 uppercase tracking-tight">
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </h2>
              <p className="text-white/60 text-xs mb-6">
                {authMode === 'login' 
                  ? 'Access your watchlist and favorites across devices.' 
                  : 'Start building your personalized library today.'}
              </p>

              {authError && (
                <div className="p-3 bg-red-950/50 border border-red-900/50 text-red-200 rounded-lg text-xs mb-4 text-center">
                  {authError}
                </div>
              )}
              
              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authMode === 'register' && (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider block mb-1">Name</label>
                    <input 
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Your Name"
                      required
                      className="w-full bg-black/50 border border-white/20 rounded-md px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-500 transition-colors"
                    />
                  </div>
                )}
                
                <div>
                  <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider block mb-1">Email Address</label>
                  <input 
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="name@example.com"
                    required
                    className="w-full bg-black/50 border border-white/20 rounded-md px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-white/50 tracking-wider block mb-1">Password</label>
                  <input 
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full bg-black/50 border border-white/20 rounded-md px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-white text-black font-bold rounded-md py-3 hover:bg-white/90 transition-colors cursor-pointer text-sm uppercase tracking-wider"
                >
                  {authMode === 'login' ? 'Sign In' : 'Register'}
                </button>
              </form>

              <div className="mt-6 text-center text-xs text-white/40">
                {authMode === 'login' ? (
                  <p>
                    Don't have an account?{' '}
                    <button 
                      onClick={() => { setAuthMode('register'); setAuthError(null); }}
                      className="text-red-500 hover:underline font-bold bg-transparent border-none cursor-pointer"
                    >
                      Sign Up
                    </button>
                  </p>
                ) : (
                  <p>
                    Already have an account?{' '}
                    <button 
                      onClick={() => { setAuthMode('login'); setAuthError(null); }}
                      className="text-red-500 hover:underline font-bold bg-transparent border-none cursor-pointer"
                    >
                      Sign In
                    </button>
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
