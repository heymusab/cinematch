export interface Movie {
  title: string;
  year: string;
  genre: string;
  director: string;
  summary: string;
  reason: string;
  poster_path?: string;
  backdrop_path?: string;
  tmdb_id?: number;
  vote_average?: number;
  release_date?: string;
  type?: 'movie' | 'tv';
}

export interface SuggestionResponse {
  movies: Movie[];
  error?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  favorites: number[]; // Array of TMDB IDs
  watchlist: number[];
  token?: string;
}

export interface CastMember {
  name: string;
  character: string;
  profile_path?: string;
}

export interface WatchProvider {
  name: string;
  logo_path?: string;
}

export interface MovieDetails extends Movie {
  runtime?: number;
  tagline?: string;
  overview?: string;
  videos?: {
    results: Array<{
      key: string;
      site: string;
      type: string;
    }>;
  };
  credits?: {
    cast: CastMember[];
  };
  number_of_seasons?: number;
  watch_providers?: WatchProvider[];
}

