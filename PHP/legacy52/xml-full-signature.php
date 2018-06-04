<?php

/*
 * This file initiates a XML signature of the entire XML using REST PKI and renders the signature page. The form
 * is posted to another file, xml-full-signature-action.php, which calls REST PKI again to complete the signature.
 */

// The file RestPkiLegacy52.php contains the helper classes to call the REST PKI API.
require_once 'RestPkiLegacy52.php';

// The file util.php contains the function getRestPkiClient(), which gives us an instance of the RestPkiClient
// class initialized with the API access token.
require_once 'util.php';

// Get an instance of the RestPkiFullXmlSignatureStarter class, responsible for receiving the signature elements and
// start the signature process.
$signatureStarter = new RestPkiFullXmlSignatureStarter(getRestPkiClient());

// Set the XML to be signed, a sample XML document.
$signatureStarter->setXmlToSignPath('content/SampleDocument.xml');

// Set the location on which to insert the signature node. If the location is not specified, the signature will appended
// to the root element (which is most usual with enveloped signatures).
$signatureStarter->setSignatureElementLocation(
	'//ls:signaturePlaceholder',
	RestPkiXmlInsertionOptions::APPEND_CHILD,
	array('ls' => 'http://www.lacunasoftware.com/sample')
);

// Set the signature policy.
$signatureStarter->setSignaturePolicy(RestPkiStandardSignaturePolicies::XML_XADES_BES);

// Set a SecurityContext to be used to determine trust in the certificate chain. We have encapsulated the security
// context on util.php
$signatureStarter->setSecurityContext(getSecurityContextId());

// Call the startWithWebPki() method, which initiates the signature. This yields the token, a 43-character
// case-sensitive URL-safe string, which identifies this signature process. We'll use this value to call the
// signWithRestPki() method on the Web PKI component (see signature-form.sj) and also to complete the signature after
// the form is submitted (see file xml-full-signature-action.php). This should not be mistaken with the API access
// token.
$token = $signatureStarter->startWithWebPki();

// The token acquired above can only be used for a single signature attempt. In order to retry the signature it is
// necessary to get a new token. This can be a problem if the user uses the back button of the browser, since the
// browser might show a cached page that we rendered previously, with a now stale token. To prevent this from happening,
// we call the function setNoCacheHeaders(), located in util.php, which sets HTTP headers to prevent caching of the
// page.
setNoCacheHeaders();

?>

<!DOCTYPE html>
<html>
<head>
	<title>Full XML signature (enveloped signature)</title>
	<?php include 'includes.php' // jQuery and other libs (used only to provide a better user experience, but NOT required to use the Web PKI component). ?>
</head>
<body>

<?php include 'menu.php' // The top menu, this can be removed entirely. ?>

<div class="container">

	<h2>Full XML signature (enveloped signature)</h2>

	<?php // Notice that we'll post to a different PHP file. ?>
	<form id="signForm" action="xml-full-signature-action.php" method="POST">

		<?php // Render the $token in a hidden input field. ?>
		<input type="hidden" name="token" value="<?php echo $token; ?>">

		<div class="form-group">
			<label>File to sign</label>
			<p>You are signing this <b>entire</b> <a href='content/SampleDocument.xml'>sample XML</a>.</p>
		</div>

		<?php
        // Render a select (combo box) to list the user's certificates. For now it will be empty, we'll populate it
        // later on (see signature-form.js).
		?>
		<div class="form-group">
			<label for="certificateSelect">Choose a certificate</label>
			<select id="certificateSelect" class="form-control"></select>
		</div>

		<?php
        // Action buttons. Notice that the "Sign File" button is NOT a submit button. When the user clicks the button,
        // we must first use the Web PKI component to perform the client-side computation necessary and only when
        // that computation is finished we'll submit the form programmatically (see signature-form).
		?>
		<button id="signButton" type="button" class="btn btn-primary">Sign File</button>
		<button id="refreshButton" type="button" class="btn btn-default">Refresh Certificates</button>
	</form>

</div>

<?php
// The file below contains the JS lib for accessing the Web PKI component. For more information, see:
// https://webpki.lacunasoftware.com/#/Documentation
?>
<script src="content/js/lacuna-web-pki-2.9.0.js"></script>

<?php
// The file below contains the JS lib for accessing the Web PKI component. For more information, see:
// https://webpki.lacunasoftware.com/#/Documentation
?>
<script src="content/js/signature-form.js"></script>
<script>
    $(document).ready(function () {
        // Once the page is ready, we call the init() function on the javascript code (see signature-form.js).
        signatureForm.init({
            token: '<?php echo $token ?>',              // The token acquired from REST PKI.
            form: $('#signForm'),                       // The form that should be submitted when the operation is complete.
            certificateSelect: $('#certificateSelect'), // The <select> element (combo box) to list the certificates.
            refreshButton: $('#refreshButton'),         // The "refresh" button.
            signButton: $('#signButton')                // The button that initiates the operation.
        });
    });
</script>

</body>
</html>
