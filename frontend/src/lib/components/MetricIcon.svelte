<script lang="ts">
  import type { LucideIcon } from '@lucide/svelte';
  import BedDouble from '@lucide/svelte/icons/bed-double';
  import ChartNoAxesColumn from '@lucide/svelte/icons/chart-no-axes-column';
  import ChevronsDown from '@lucide/svelte/icons/chevrons-down';
  import ChevronsUp from '@lucide/svelte/icons/chevrons-up';
  import Clock from '@lucide/svelte/icons/clock';
  import Crosshair from '@lucide/svelte/icons/crosshair';
  import Disc3 from '@lucide/svelte/icons/disc-3';
  import Feather from '@lucide/svelte/icons/feather';
  import FishingRod from '@lucide/svelte/icons/fishing-rod';
  import Footprints from '@lucide/svelte/icons/footprints';
  import Hammer from '@lucide/svelte/icons/hammer';
  import Hand from '@lucide/svelte/icons/hand';
  import Handshake from '@lucide/svelte/icons/handshake';
  import HeartCrack from '@lucide/svelte/icons/heart-crack';
  import Mountain from '@lucide/svelte/icons/mountain';
  import PackageMinus from '@lucide/svelte/icons/package-minus';
  import PackageOpen from '@lucide/svelte/icons/package-open';
  import PackagePlus from '@lucide/svelte/icons/package-plus';
  import Pickaxe from '@lucide/svelte/icons/pickaxe';
  import Rabbit from '@lucide/svelte/icons/rabbit';
  import Skull from '@lucide/svelte/icons/skull';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Sword from '@lucide/svelte/icons/sword';
  import Swords from '@lucide/svelte/icons/swords';
  import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
  import WavesLadder from '@lucide/svelte/icons/waves-ladder';
  import Wrench from '@lucide/svelte/icons/wrench';

  interface Props {
    /** A metric key, such as `blocks_mined`. Unknown keys get the bar chart. */
    metric: string;
    size?: number;
  }

  let { metric, size = 20 }: Props = $props();

  /**
   * An icon for every metric the network records today, from Lucide.
   *
   * Metric keys are free text, so this map can never be complete and is not
   * meant to be: a plugin that starts sending something new renders the fallback
   * until somebody adds a line here, which is a cosmetic gap rather than a
   * broken page.
   *
   * Imported one icon per file rather than from the package root, so a build
   * ships the couple of dozen shapes below instead of all eight thousand.
   */
  const ICONS: Record<string, LucideIcon> = {
    animals_bred: Rabbit,
    blocks_mined: Pickaxe,
    climbed_cm: Mountain,
    containers_opened: PackageOpen,
    creative_flown_cm: Sparkles,
    crouched_cm: ChevronsDown,
    damage_dealt: Sword,
    damage_taken: HeartCrack,
    deaths: Skull,
    distance_traveled_cm: Footprints,
    elytra_flown_cm: Feather,
    fish_caught: FishingRod,
    items_crafted: Hammer,
    items_dropped: PackageMinus,
    items_enchanted: WandSparkles,
    items_picked_up: PackagePlus,
    jumped: ChevronsUp,
    mob_kills: Swords,
    player_kills: Crosshair,
    playtime_seconds: Clock,
    records_played: Disc3,
    slept: BedDouble,
    swam_cm: WavesLadder,
    things_used: Hand,
    tools_broken: Wrench,
    traded_with_villager: Handshake,
  };

  /**
   * The unit suffix is a decent guess when the key itself is unknown: anything
   * measured in centimetres is a distance and anything in seconds is time, so
   * `ice_boat_travelled_cm` gets footprints rather than a bar chart without
   * anybody having to think about it.
   */
  const Icon = $derived(
    ICONS[metric] ??
      (metric.endsWith('_cm')
        ? Footprints
        : metric.endsWith('_seconds')
          ? Clock
          : ChartNoAxesColumn),
  );
</script>

<!--
  Decorative throughout: every icon sits next to the metric's own label, so a
  screen reader that announced it too would read everything twice.
-->
<Icon {size} aria-hidden="true" focusable="false" />
