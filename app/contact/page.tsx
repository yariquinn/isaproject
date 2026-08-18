import ContactForm from "./ContactForm";

export const metadata = {
  title: "Contact – The Law Office of Isa Abdur-Rahman, PLLC",
};

export default function Contact() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Contact</p>
        <h1>Get in Touch</h1>
        <p>
          The Law Office of Isa Abdur-Rahman, PLLC is available for an initial
          consultation about options for situations involving property, estate,
          or business disputes.
        </p>
      </section>

      <section className="block">
        <div className="container">
          <div className="contact-grid">
            <div className="contact-item">
              <div className="label">Office</div>
              90-04 161st Street, Suite 308
              <br />
              Jamaica, New York 11432
            </div>
            <div className="contact-item">
              <div className="label">Phone</div>
              <a href="tel:+17182620682">(718) 262-0682</a>
              <br />
              Fax: (718) 732-2656
            </div>
            <div className="contact-item">
              <div className="label">Email</div>
              <a href="mailto:info@rahman-esq.com">info@rahman-esq.com</a>
            </div>
          </div>
        </div>
      </section>

      <section className="block alt">
        <div className="container">
          <h2 className="section-title">Send a Message</h2>
          <p className="section-sub">
            Share a few details about your matter and we&rsquo;ll follow up with
            you directly.
          </p>
          <div className="form-wrap">
            <ContactForm />
          </div>
        </div>
      </section>
    </main>
  );
}
