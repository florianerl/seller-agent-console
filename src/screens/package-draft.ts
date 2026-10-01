import type { MediaKitPackage, PackageCreate } from "../api/endpoints";
import { priceProblem } from "../lib/money";

/**
 * The media kit and the Catalog's package table read the same packages under
 * different resource names, so a write from either drops both rather than
 * leave the other screen showing the old ones.
 */
export const PACKAGE_VIEWS = ["packages", "media-kit*"];

/**
 * What the media kit form edits: the fields a buyer browsing the kit sees,
 * all of which the public view returns, so an edit starts from what is
 * stored rather than from a blank. Prices are on the form only when
 * creating: the kit shows a band, not the stored base, and the Catalog's
 * package table owns price edits for the reason its `changes()` records.
 * `seasonal_label` is writable too but no view returns it, so there is
 * nothing to prefill and an edit would overwrite it blind.
 */
export type PackageDraft = {
  name: string;
  description: string;
  adFormats: string[];
  deviceTypes: number[];
  geoTargets: string[];
  tags: string[];
  featured: boolean;
  base: string;
  floor: string;
};

export const EMPTY_DRAFT: PackageDraft = {
  name: "",
  description: "",
  adFormats: [],
  deviceTypes: [],
  geoTargets: [],
  tags: [],
  featured: false,
  base: "",
  floor: "",
};

export function draftOf(pkg: MediaKitPackage): PackageDraft {
  return {
    ...EMPTY_DRAFT,
    name: pkg.name,
    description: pkg.description ?? "",
    adFormats: [...pkg.ad_formats],
    // A non-numeric device type cannot be shown in the AdCOM select; dropping
    // it here is safe only because `packageChanges` compares against the same
    // filtered list, so it is never sent unless the operator touches the field.
    deviceTypes: numericDevices(pkg),
    geoTargets: [...pkg.geo_targets],
    tags: [...pkg.tags],
    featured: pkg.is_featured,
  };
}

function numericDevices(pkg: MediaKitPackage): number[] {
  return pkg.device_types.filter((d): d is number => typeof d === "number");
}

function sameList<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Only what changed goes on the wire: the PUT is a partial update upstream,
 * so an untouched field — prices, placements, the seasonal label — keeps
 * whatever it holds. A cleared description is sent as null, not "", so it
 * reads as absent the way a never-set one does.
 */
export function packageChanges(pkg: MediaKitPackage, draft: PackageDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const name = draft.name.trim();
  if (name && name !== pkg.name) out.name = name;
  const description = draft.description.trim() || null;
  if (description !== (pkg.description ?? null)) out.description = description;
  if (!sameList(draft.adFormats, pkg.ad_formats)) out.ad_formats = draft.adFormats;
  if (!sameList(draft.deviceTypes, numericDevices(pkg))) out.device_types = draft.deviceTypes;
  if (!sameList(draft.geoTargets, pkg.geo_targets)) out.geo_targets = draft.geoTargets;
  if (!sameList(draft.tags, pkg.tags)) out.tags = draft.tags;
  if (draft.featured !== pkg.is_featured) out.is_featured = draft.featured;
  return out;
}

/** Why the draft cannot be created yet, or undefined when it can. */
export function createProblem(draft: PackageDraft): string | undefined {
  return (
    (draft.name.trim() ? undefined : "Name the package.") ??
    priceProblem(draft.base) ??
    priceProblem(draft.floor)
  );
}

/** Empty lists and a blank description are left out; upstream defaults them. */
export function createBody(draft: PackageDraft): PackageCreate {
  const body: PackageCreate = {
    name: draft.name.trim(),
    base_price: Number(draft.base),
    floor_price: Number(draft.floor),
    is_featured: draft.featured,
  };
  const description = draft.description.trim();
  if (description) body.description = description;
  if (draft.adFormats.length) body.ad_formats = draft.adFormats;
  if (draft.deviceTypes.length) body.device_types = draft.deviceTypes;
  if (draft.geoTargets.length) body.geo_targets = draft.geoTargets;
  if (draft.tags.length) body.tags = draft.tags;
  return body;
}
