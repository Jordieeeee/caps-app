import { ServiceOrderList } from '@/collector/components/service-order-list';

/** Disconnection orders. Title comes from the More stack's navigation header. */
export default function DisconnectionsScreen() {
  return <ServiceOrderList kind="disconnection" />;
}
