var express = require('express');
var request = require('request');
var fs = require('fs');
var crypto = require('crypto');
var uuid = require('node-uuid');
var restPki = require('../lacuna-restpki');
var util = require('../util');

var router = express.Router();
var appRoot = process.cwd();

/**
 * GET /cades-signature-server-key
 *
 * This route performs a CAdES signature using REST PKI and PEM-encoded files
 * for a certificate and for its private key. It renders the signature page.
 */
router.get('/', function(req, res, next) {

   // Read PEM-encoded certificate file for ("Pierre de Fermat")
   var cert = fs.readFileSync('./resources/fermat-cert.pem');

   var restRequest = {

      // Base64-encoding of the signer certificate
      certificate: new Buffer(cert).toString('base64'),

      // Optionally, set whether the content should be encapsulated in the
      // resulting CMS. If this parameter is omitted, the following rules
      // apply:
      //
      // - If no CmsToCoSign is given, the resulting CMS will include the
      //   content.
      // - If a CmsToCoSign is given, the resulting CMS will include the
      //   content, if and only if, the CmsToCoSign also includes the content.
      encapsulateContent: true,

      // Set the signature policy. For this sample, we'll use the Lacuna Test
      // PKI in order to accept our test certificate used above ("Pierre de
      // Fermat"). This security context should be used FOR DEVELOPMENT PUPOSES
      // ONLY. In production, you'll  typically want one of the alternatives
      // below.
      signaturePolicyId: restPki.standardSignaturePolicies.pkiBrazilCadesAdrBasica,
      securityContextId: restPki.standardSecurityContexts.lacunaTest
   };

   if (req.query.userfile) {

      // If the user was redirected here by the route "upload" (signature with
      // file uploaded by user), the "userfile" URL argument will contain the
      // filename under the "public/app-data" folder.
      restRequest['contentToSign'] = new Buffer(fs.readFileSync(appRoot + '/public/app-data/' + req.query.userfile)).toString('base64');

   } else if (req.query.cmsfile) {

      /*
       * If the URL argument "cmsfile" is filled, the user has asked to co-sign
       * a previously signed CMS. We'll set the path to the CMS to be co-signed,
       * which was previously saved in the "app-data". Since we're creating CMSs
       * with encapsulated content (see call to setEncapsulateContent below), we
       * don't need to set the content to be signed, REST PKI will get the
       * content from the CMS being co-signed.
       */
      restRequest['cmsToCoSign'] = new Buffer(fs.readFileSync(appRoot + '/public/app-data/' + req.query.cmsfile)).toString('base64');

   } else {

      // If both userfile and cms file are null/undefined, this is the
      // "signature with server file" case. We'll set the path to the sample
      // document.
      restRequest['contentToSign'] = new Buffer(util.getPdfStampContent());
   }

   request.post(util.endpoint + 'Api/CadesSignatures', {

      json: true,
      headers: {'Authorization': 'Bearer ' + util.accessToken},
      body: restRequest

   }, onSignatureStarted);

   // This function will be executed as callback of the POST request that
   // inicializes the signature on REST PKI. The response will be checked and
   // if an error occured, it will be rendered.
   function onSignatureStarted(err, restRes, body) {

      if (restPki.checkResponse(err, restRes, body, next)) {

         // Read PEM-encoded private-key file for ("Pierre de Fermat").
         var pkey = fs.readFileSync('./resources/fermat-pkey.pem', 'binary');

         // Get signature algorithm from the digestAlgorithmOid. It will be used
         // by the crypto library to perform the signature.
         var signatureAlgorithm;
         switch (restRes.body.digestAlgorithmOid) {
            case '1.2.840.113549.2.5':
               signatureAlgorithm = 'RSA-MD5';
               break;
            case '1.3.14.3.2.26':
               signatureAlgorithm = 'RSA-SHA1';
               break;
            case '2.16.840.1.101.3.4.2.1':
               signatureAlgorithm = 'RSA-SHA256';
               break;
            case '2.16.840.1.101.3.4.2.2':
               signatureAlgorithm = 'RSA-SHA384';
               break;
            case '2.16.840.1.101.3.4.2.3':
               signatureAlgorithm = 'RSA-SHA512';
               break;
            default:
               signatureAlgorithm = null;
         }

         // Create a new signature, setting the algorithm that will be used.
         var sign = crypto.createSign(signatureAlgorithm);

         // Set the data that will be signed.
         sign.write(new Buffer(restRes.body.toSignData, 'base64'));
         sign.end();

         // Perform the signature and receiving Base64-enconding of the
         // signature.
         var signature = sign.sign({key: pkey, passphrase: '1234'}, 'base64');

         // Call the action POST Api/CadesSignatures/{token}/SignedBytes on REST
         // PKI, which finalizes the signature process and returns the signed
         // PDF.
         request.post(util.endpoint + 'Api/CadesSignatures/' + restRes.body.token + '/SignedBytes', {

            json: true,
            headers: {'Authorization': 'Bearer ' + util.accessToken},
            body: {'signature': signature}

         }, onSignatureCompleted);
      }
   }

   // This function will be executed as callback of the POST request that
   // finalizes the signature on REST PKI. The response will be checked and if
   // an error occurred, it will be rendered.
   function onSignatureCompleted(err, restRes, body) {

      if (restPki.checkResponse(err, restRes, body, next)) {

         // At this point, you'd typically store the signed PDF on your
         // database. For demonstration purposes, we'll store the PDF on a
         // temporary folder publicly accessible and render a link to it.
         var signedContent = new Buffer(restRes.body.cms, 'base64');
         var filename = uuid.v4() + '.p7s';
         var appDataPath = appRoot + '/public/app-data/';
         if (!fs.existsSync(appDataPath)) {
            fs.mkdirSync(appDataPath);
         }
         fs.writeFileSync(appDataPath + filename, signedContent);

         res.render('cades-signature-complete', {
            signedFile: filename,
            signerCert: restRes.body.certificate
         });

      }
   }
});

module.exports = router;