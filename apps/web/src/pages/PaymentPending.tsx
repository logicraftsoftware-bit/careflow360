import { CalendarCheck2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";

export function PaymentPendingPage() {
  const { appointmentNumber } = useParams();
  return (
    <main className="payment-placeholder">
      <section>
        <CalendarCheck2 />
        <span>CAREFLOW360 SECURE PAYMENT</span>
        <h1>Online payment is being configured</h1>
        <p>
          Your appointment slot is reserved. The clinic will share an active
          payment link when online payment becomes available.
        </p>
        <dl>
          <dt>Appointment number</dt>
          <dd>{appointmentNumber}</dd>
        </dl>
        <p className="payment-note">
          Please do not make a payment to any account that is not confirmed by
          the clinic.
        </p>
        <Link className="btn" to="/login">Return to CareFlow360</Link>
      </section>
    </main>
  );
}
