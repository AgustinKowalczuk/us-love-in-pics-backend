import { mailer } from "./mailer.js";
import { env } from "./env.js";

async function testMailer() {
  try {
    await mailer.verify();

    console.log("SMTP connection established successfully.");

    const info = await mailer.sendMail({
      from: env.EMAIL_FROM,
      to: env.SMTP_USER,
      subject: "Us Love In Pics - SMTP Test",
      text: "Your email configuration is working correctly.",
      html: "<h1>Us Love In Pics</h1><p>Your email configuration is working correctly.</p>",
    });

    console.log("Email sent successfully.");
    console.log("Message ID:", info.messageId);

    if (nodemailerIsEthereal()) {
      console.log(
        "Preview URL:",
        `https://ethereal.email/message/${info.messageId}`,
      );
    }
  } catch (error) {
    console.error("SMTP test failed:", error);
    process.exitCode = 1;
  } finally {
    await mailer.close();
  }
}

function nodemailerIsEthereal(): boolean {
  return env.SMTP_HOST === "smtp.ethereal.email";
}

testMailer();