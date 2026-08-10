import { ServiceOrderList } from '@/collector/components/service-order-list';

/** Reconnection orders. Title comes from the Route stack's navigation header. */
export default function ReconnectionsScreen() {
  return <ServiceOrderList kind="reconnection" />;
}
