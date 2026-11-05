import type { Booking, Resource, ResourceRequest } from '@shared/types';
import { currentT } from '../../lib/lang';

type Slot = Pick<ResourceRequest, 'id' | 'resourceId' | 'date' | 'startMin' | 'endMin'>;

/** Other open or approved requests for the same catalogue resource at an overlapping time. */
export const overlapping = (all: ResourceRequest[], q: Slot) =>
  q.resourceId == null
    ? []
    : all.filter(
        (o) =>
          o.id !== q.id &&
          o.status !== 'ABGELEHNT' &&
          o.resourceId === q.resourceId &&
          o.date === q.date &&
          o.startMin < q.endMin &&
          o.endMin > q.startMin,
      );

/** Bookings of the same shared resource by other Kompanien at an overlapping time. */
export const externalClashes = (bookings: Booking[], q: Slot) =>
  q.resourceId == null
    ? []
    : bookings.filter((b) => b.resourceId === q.resourceId && b.date === q.date && b.startMin < q.endMin && b.endMin > q.startMin);

/** «Mannschaftsbus 1», «2× Pickup (Pickup 1, Pickup 2)», «Transport 30 Pers. (…)» or «Eigene Fläche». */
export function requestLabel(
  q: Pick<ResourceRequest, 'resourceId' | 'category' | 'quantity' | 'assignedIds' | 'kind' | 'area'> & { persons?: number },
  resources: Resource[],
) {
  const name = (id: number) => resources.find((r) => r.id === id)?.name ?? '?';
  if (q.resourceId != null) return name(q.resourceId);
  if (q.kind === 'GELAENDE') return currentT('res.ownArea');
  const amount = q.persons ? currentT('res.transportN', { n: q.persons, cat: q.category ? ` (${q.category})` : '' }) : `${q.quantity}× ${q.category}`;
  return q.assignedIds.length ? `${amount} (${q.assignedIds.map(name).join(', ')})` : amount;
}
