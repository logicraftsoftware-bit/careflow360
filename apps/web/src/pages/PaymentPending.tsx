import { CalendarCheck2 } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../api";

export function PaymentPendingPage() {
  const { appointmentNumber } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["public-payment", appointmentNumber],
    queryFn: () => api.get(`/public/payments/${appointmentNumber}`).then(unwrap),
    enabled: !!appointmentNumber,
    refetchInterval: 5000,
  });
  return (
    <main className="payment-placeholder">
      <section>
        <CalendarCheck2 />
        <span>CAREFLOW360 SECURE PAYMENT</span>
        <h1>{data?.status === "PAID" ? "Payment completed" : "Complete your appointment payment"}</h1>
        <p>
          {data?.status === "PAID"
            ? "Your payment is confirmed and your appointment token has been generated."
            : "Your appointment slot is reserved until payment is completed."}
        </p>
        <dl>
          <dt>Appointment number</dt>
          <dd>{appointmentNumber}</dd>
          {data?.clinicName && <><dt>Clinic</dt><dd>{data.clinicName}</dd></>}
          {data?.amount != null && <><dt>Amount</dt><dd>₹{Number(data.amount).toLocaleString("en-IN")}</dd></>}
          {data?.token && <><dt>Token</dt><dd>{data.token}</dd></>}
        </dl>
        {isLoading && <p>Loading secure payment…</p>}
        {error && <div className="alert error">Unable to load this payment.</div>}
        {!isLoading && data?.status === "PENDING" && data?.paymentUrl && <a className="btn" href={data.paymentUrl}>Pay securely with Razorpay</a>}
        {!isLoading && data?.status === "PENDING" && !data?.paymentUrl && <div className="alert error">The online payment link is not available. Please contact the clinic.</div>}
        <p className="payment-note">Only pay through the secure Razorpay button shown on this page.</p>
        <Link className="btn" to="/login">Return to CareFlow360</Link>
      </section>
    </main>
  );
}
