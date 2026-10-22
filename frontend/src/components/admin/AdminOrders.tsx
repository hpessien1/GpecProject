import { ordersContent } from '../../data/adminContent'

// Paid orders from the shop. Orders are created only by Paystack checkout, which is not built yet,
// so this says so rather than showing an empty list with no explanation.
export default function AdminOrders() {
  return <section aria-labelledby="admin-orders-title">
    <div className="admin-heading">
      <div><p className="eyebrow"><span /> {ordersContent.eyebrow}</p><h1 id="admin-orders-title" tabIndex={-1}>{ordersContent.title}</h1></div>
    </div>
    <div className="shop-status" role="status"><p>{ordersContent.empty}</p></div>
  </section>
}
