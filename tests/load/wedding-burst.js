import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    wedding_burst: { executor: "shared-iterations", vus: 60, iterations: 300, maxDuration: "10m" },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{endpoint:gallery}": ["p(95)<1000"],
    "http_req_duration{endpoint:like}": ["p(95)<1000"],
  },
};

const baseUrl = __ENV.BASE_URL;
const eventToken = __ENV.EVENT_TOKEN;
if (!baseUrl || !eventToken) throw new Error("BASE_URL and EVENT_TOKEN are required");

export default function weddingBurst() {
  const jar = http.cookieJar();
  const join = http.get(`${baseUrl}/join/${eventToken}`, { redirects: 5 });
  check(join, { "join admitted": (response) => response.status === 200 });
  const guest = http.post(`${baseUrl}/api/guest/session`, JSON.stringify({ displayName: `Load Guest ${__VU}-${__ITER}`, consentAccepted: true }), { headers: { "Content-Type": "application/json", Origin: baseUrl } });
  check(guest, { "guest session created": (response) => response.status === 200 });
  const gallery = http.get(`${baseUrl}/api/photos`, { tags: { endpoint: "gallery" } });
  check(gallery, { "gallery succeeds": (response) => response.status === 200 });
  const photos = gallery.json("photos") || [];
  const eligible = photos.find((photo) => !photo.isMine);
  if (eligible) {
    const like = http.put(`${baseUrl}/api/photos/${eligible.id}/like`, null, { headers: { Origin: baseUrl }, tags: { endpoint: "like" } });
    check(like, { "like succeeds": (response) => response.status === 200 });
  }
  jar.clear(baseUrl);
  sleep(0.2);
}
