# Ship Icons

Ship icons are generated programmatically in `src/layers/ships.ts` using Canvas API.

Each icon is a 32x32 white silhouette that gets color-tinted at runtime based on ship type:

- **cargo.png** - Container ship silhouette (Blue #3B82F6)
- **tanker.png** - Tanker silhouette (Red #EF4444)
- **passenger.png** - Cruise ship silhouette (Green #22C55E)
- **fishing.png** - Fishing vessel silhouette (Orange #F97316)
- **other.png** - Generic ship silhouette (Gray #9CA3AF)

The icons point upward (north) in their default orientation and are rotated
at runtime to match the ship's heading.
