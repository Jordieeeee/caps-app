const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/readings', require('./meterReadingRoutes'));
/**
 * `/collections` is gone, deliberately.
 *
 * It carried `POST /collections/sync` (a collector's phone filing a cash payment)
 * and `GET /collections`. TWD's collectors read meters; payment happens at the
 * office, so the write had no legitimate caller — and the mobile app never had
 * one, in any build. The read was worse: it sat under a bare `router.use(auth)`
 * with no `requireRole`, so any signed-in consumer could list every payment record
 * in the district, unfiltered.
 *
 * The `collections` collection in Mongo is untouched — it belongs to the Admin
 * Portal, which is a separate application. This backend simply no longer exposes
 * it. Restore from git if the district ever puts collectors on cash.
 */
router.use('/service-orders', require('./serviceOrderRoutes'));
router.use('/accounts', require('./accountRoutes'));
router.use('/billing', require('./billingRoutes'));
router.use('/announcements', require('./announcementRoutes'));
router.use('/feedback', require('./feedbackRoutes'));
router.use('/profile', require('./profileRoutes'));
router.use('/notifications', require('./notificationRoutes'));

module.exports = router;
