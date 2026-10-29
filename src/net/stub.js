// Portal (CrazyGames) derlemesi: ag yok. Dugme gizlidir (NET_ON false); buradaki siniflar hicbir zaman cagrilmaz.
const off = () => { throw new Error('network disabled in this build'); };
export class RoomClient { static host() { return off(); } static join() { return off(); } }
export const parseNetsim = () => null;
export class HostSession { constructor() { off(); } }
export class GuestSession { constructor() { off(); } }
export class Autopilot { constructor() { off(); } }
