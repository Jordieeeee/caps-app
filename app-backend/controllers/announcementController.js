const Announcement = require('../models/Announcement');
const noticeStream = require('../services/noticeStream');
const { audienceFor, present } = require('../utils/noticePresenter');
const httpError = require('../utils/httpError');
const ErrorCodes = require('../utils/errorCodes');

/**
 * Published notices for the caller's audience.
 *
 * The audience comes from the token's role claim, never from a query parameter —
 * otherwise any consumer could request `?audience=collectors` and read the
 * district's internal operational notices.
 *
 * The category → type/priority maps that used to live here moved to
 * utils/noticePresenter.js when the live stream below started needing them too.
 */
exports.list = async (req, res) => {
  const notices = await Announcement.listPublishedFor(audienceFor(req.user.role));
  res.json({ announcements: notices.map(present) });
};

/**
 * The same feed, as a live connection.
 *
 * Holds the response open and writes an event whenever the portal publishes
 * something this caller is allowed to see. The client re-reads `GET /` above when
 * one arrives — see services/noticeStream.js for why the event deliberately does
 * not carry the notice itself.
 *
 * Not wrapped in asyncHandler and it must not be: this handler never resolves, and
 * the error handler cannot help a response whose headers went out minutes ago. The
 * only ways out are the client disconnecting or the process ending.
 *
 * `X-Accel-Buffering: no` is for the reverse proxy TWD will eventually put in
 * front of this. Nginx buffers proxied responses by default, which for a stream
 * means every event sits in a buffer waiting for a body that never ends — the
 * feature works perfectly in development and dies silently on deployment.
 */
exports.stream = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Tells the client the stream is live rather than merely connected — an open
  // socket that has not yet been registered would silently miss a notice.
  res.write('event: ready\ndata: {}\n\n');

  const unsubscribe = noticeStream.subscribe(res, audienceFor(req.user.role));
  req.on('close', unsubscribe);
};

/** Publishing is an Admin Portal function; this backend only reads `cmscontents`. */
exports.create = async (req, res) => {
  throw httpError(
    410,
    'Notices are published from the TWD Admin Portal. This endpoint no longer accepts writes.',
    ErrorCodes.NOT_SUPPORTED
  );
};
