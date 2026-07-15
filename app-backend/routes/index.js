const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/readings', require('./meterReadingRoutes'));
router.use('/collections', require('./collectionRoutes'));
router.use('/service-orders', require('./serviceOrderRoutes'));
router.use('/accounts', require('./accountRoutes'));
router.use('/billing', require('./billingRoutes'));
router.use('/announcements', require('./announcementRoutes'));
router.use('/feedback', require('./feedbackRoutes'));
router.use('/notifications', require('./notificationRoutes'));

module.exports = router;
