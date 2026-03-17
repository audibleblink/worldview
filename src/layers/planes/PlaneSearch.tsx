/**
 * Plane Search - Search planes by callsign
 */

import { createSignal, For, Show, onCleanup } from "solid-js";
import { PROXY_ENDPOINTS } from "../../config";
import { 
  planeState, 
  setSearchQuery, 
  setSearchResults, 
  setSearching,
  clearSearch,
} from "./store";
import type { PlaneRecord } from "./types";
import { formatAltitude, formatSpeed } from "./aircraftTypes";
import "./PlaneSearch.css";

interface Props {
  onSelect?: (icao24: string) => void;
  onFollow?: (icao24: string) => void;
}

export function PlaneSearch(props: Props) {
  const [inputValue, setInputValue] = createSignal("");
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  async function search(query: string): Promise<void> {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    setSearchQuery(query);

    try {
      const url = PROXY_ENDPOINTS.planesSearch(query);
      const response = await fetch(url);
      const data = await response.json();

      if (data.rateLimited) {
        console.warn("[PlaneSearch] Rate limited");
        setSearchResults([]);
        return;
      }

      const now = Date.now();
      const planes = (data.planes ?? []).map((p: PlaneRecord) => ({
        ...p,
        timestamp: now,
      }));

      setSearchResults(planes);
    } catch (error) {
      console.error("[PlaneSearch] Search error:", error);
      setSearchResults([]);
    }
  }

  function handleInput(value: string): void {
    setInputValue(value);
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      search(value.trim().toUpperCase());
    }, 300);
  }

  function handleSelect(icao24: string): void {
    props.onSelect?.(icao24);
    clearSearch();
    setInputValue("");
  }

  function handleFollow(icao24: string): void {
    props.onFollow?.(icao24);
    clearSearch();
    setInputValue("");
  }

  function handleClear(): void {
    clearSearch();
    setInputValue("");
  }

  onCleanup(() => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
  });

  return (
    <div class="plane-search">
      <div class="plane-search-input-wrapper">
        <input
          type="text"
          placeholder="Search by callsign..."
          value={inputValue()}
          onInput={(e) => handleInput(e.currentTarget.value)}
          class="plane-search-input"
        />
        <Show when={inputValue()}>
          <button onClick={handleClear} class="plane-search-clear">
            ×
          </button>
        </Show>
      </div>

      <Show when={planeState.isSearching}>
        <div class="plane-search-loading">Searching...</div>
      </Show>

      <Show when={planeState.searchResults.length > 0}>
        <ul class="plane-search-results">
          <For each={planeState.searchResults}>
            {(plane) => (
              <li class="plane-search-result">
                <button
                  onClick={() => handleSelect(plane.icao24)}
                  onDblClick={() => handleFollow(plane.icao24)}
                  class="plane-search-result-btn"
                >
                  <span class="plane-callsign">{plane.callsign || plane.icao24}</span>
                  <span class="plane-info">
                    {formatAltitude(plane.altitude)} · {formatSpeed(plane.velocity)}
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={planeState.searchQuery && !planeState.isSearching && planeState.searchResults.length === 0}>
        <div class="plane-search-empty">No planes found</div>
      </Show>
    </div>
  );
}

export default PlaneSearch;
