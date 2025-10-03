import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { supabase } from '../lib/supabaseClient';
import './NewShipments.css';

// Lazy load PDFGenerator to reduce initial bundle size
const PDFGenerator = lazy(() => import('./PDFGenerator.jsx'));

// Constants for better maintainability
const SHIPMENT_TYPES = ['AIR FREIGHT', 'SEA FREIGHT', 'TRANSPORT', 'OTHERS'];
const STEPS = ['Create Shipment', 'Port Details', 'Summary'];
const CATEGORIES = [
  'AGENT', 'ARLINE', 'BANK', 'BIKE', 'BIOKER', 'BUYER', 
  'CAREER', 'CAREER AGENT'
];

// Trade directions
const TRADE_DIRECTIONS = {
  'AIR FREIGHT': ['EXPORT', 'IMPORT'],
  'SEA FREIGHT': ['EXPORT', 'IMPORT'],
  'LAND': ['EXPORT', 'IMPORT'],
  'TRANSPORT': ['EXPORT', 'IMPORT'],
  'OTHERS': ['GENERAL']
};

// Initial form data
const INITIAL_FORM_DATA = {
  branch: '',
  department: '',
  shipmentDate: new Date().toISOString().split('T')[0],
  client: '',
  shipper: '',
  consignee: '',
  address: '',
  por: '',
  poi: '',
  pod: '',
  pof: '',
  hblNo: '',
  jobNo: '',
  etd: '',
  eta: '',
  incoterms: '',
  serviceType: '',
  freight: '',
  payableAt: '',
  dispatchAt: '',
  lclFcl: '',
  
  // Additional fields for summary
  HSCode: '',
  pol: '',
  pdf: '',
  carrier: '',
  vesselNameSummary: '',
  noOfRes: '',
  volume: '',
  grossWeight: '',
  description: '',
  remarks: '',
  
  // Trade direction
  tradeDirection: '',
  
  // Air Freight specific fields
  airport_of_departure: '',
  airport_of_destination: '',
  no_of_packages: '',
  dimension_cms: '',
  chargeable_weight: '',
  client_no: '',
  name_of_airline: '',
  awb: '',
  flight_from: '',
  flight_to: '',
  flight_eta: '',
  invoiceNo: '',
  invoiceDate: '',
  notify_party: '',
  
  // Sea Freight specific fields
  exporter: '',
  importer: '',
  stuffingDate: '',
  hoDate: '',
  terms: '',
  sbNo: '',
  sbDate: '',
  destination: '',
  commodity: '',
  fob: '',
  grWeight: '',
  netWeight: '',
  railOutDate: '',
  containerNo: '',
  noOfCntr: '',
  sLine: '',
  mblNo: '',
  mblDate: '',
  hblDt: '',
  vessel: '',
  voy: '',
  sob: '',
  ac: '',
  billNo: '',
  billDate: '',
  ccPort: '',
};

const INITIAL_ORG_FORM_DATA = {
  name: '',
  recordStatus: '',
  salesPerson: '',
  category: '',
  branch: '',
  contactPerson: '',
  doorNo: '',
  buildingName: '',
  street: '',
  area: '',
  city: '',
  state: ''
};

const NewShipments = () => {
  
  const [showShipmentForm, setShowShipmentForm] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [shipmentType, setShipmentType] = useState('');
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [amount, setAmount] = useState("27.22");
  const [validationErrors, setValidationErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [shipments, setShipments] = useState([]);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [editingShipment, setEditingShipment] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [shipmentToDelete, setShipmentToDelete] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [generatePDF, setGeneratePDF] = useState(false);
  const [pdfShipmentData, setPdfShipmentData] = useState(null);
  
  const tableContainerRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState('auto');
  const handlePDFReady = useCallback((blob) => {
    console.log('PDF is ready for download', blob);
  }, []);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [orgFormData, setOrgFormData] = useState(INITIAL_ORG_FORM_DATA);

  // Define required fields for each step
  const requiredFields = useMemo(() => ({
    1: ['shipmentType'],
    2: ['branch', 'department', 'shipmentDate', 'client', 'shipper', 'consignee', 
        'por', 'pol', 'pod', 'pof', 'hblNo', 'jobNo', 'etd', 'eta', 'incoterms', 
        'serviceType', 'freight', 'payableAt', 'dispatchAt'],
    3: []
  }), []);

  // Filter jobs by shipment type
  const filteredJobs = useMemo(() => {
    if (!shipmentType) return jobs;
    return jobs.filter(job => job.job_type === shipmentType);
  }, [jobs, shipmentType]);

  // Fetch jobs from Supabase for dropdown
  const fetchJobs = useCallback(async () => {
    try {
      setIsLoadingJobs(true);
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      console.log('Raw jobs data:', data);
      const formattedJobs = (data || []).map(job => ({
        id: job.id,
        job_no: job.job_no,
        job_no_display: job.job_no || `JOB-${job.id.toString().padStart(6, '0')}`,
        client: job.client || '',
        shipper: job.shipper || '',
        consignee: job.consignee || '',
        address: job.address || '',
        por: job.por || '',
         lcl_fcl: job.lcl_fcl || '',
        poi: job.poi || '',
        pod: job.pod || '',
        pof: job.pof || '',
        pol: job.pol || '',
        pdf: job.pdf || '',
        hbl_no: job.hbl_no || '',
        etd: job.etd || '',
        eta: job.eta || '',
        incoterms: job.incoterms || '',
        service_type: job.service_type || '',
        freight: job.freight || '',
        payable_at: job.payable_at || '',
        dispatch_at: job.dispatch_at || '',
        carrier: job.carrier || '',
        vessel_name: job.vessel_name || '',
        no_of_res: job.no_of_res || '',
        volume: job.volume || '',
        gross_weight: job.gross_weight || '',
        description: job.description || '',
        remarks: job.remarks || '',
        hs_code: job.hs_code || '',
        branch: job.branch || '',
        department: job.department || '',
        job_type: job.job_type || '',
        trade_direction: job.trade_direction || 'EXPORT',

        // Air Freight fields
        airport_of_departure: job.airport_of_departure || '',
        airport_of_destination: job.airport_of_destination || '',
        no_of_packages: job.no_of_packages || '',
        dimension_cms: job.dimension_cms || '',
        chargeable_weight: job.chargeable_weight || '',
        client_no: job.client_no || '',
        name_of_airline: job.name_of_airline || '',
        awb: job.awb || '',
        flight_from: job.flight_from || '',
        flight_to: job.flight_to || '',
        flight_eta: job.flight_eta || '',
        invoiceNo: job.invoiceNo || '',
        invoiceDate: job.invoice_date || '',
        notify_party: job.notify_party || '',

        // Sea Freight fields
        exporter: job.exporter || '',
        importer: job.importer || '',
        stuffingDate: job.stuffingDate || '',
        hoDate: job.hoDate || '',
        terms: job.terms || '',
        sbNo: job.sbNo || '',
        sbDate: job.sbDate || '',
        destination: job.destination || '',
        commodity: job.commodity || '',
        fob: job.fob || '',
        grWeight: job.grWeight || '',
        netWeight: job.netWeight || '',
        railOutDate: job.railOutDate || '',
        containerNo: job.containerNo || '',
        noOfCntr: job.noOfCntr || '',
        sLine: job.sLine || '',
        mblNo: job.mblNo || '',
        mblDate: job.mblDate || '',
        hblDt: job.hblDt || '',
        vessel: job.vessel || '',
        voy: job.voy || '',
        sob: job.sob || '',
        ac: job.ac || '',
        billNo: job.billNo || '',
        billDate: job.billDate || '',
        ccPort: job.ccPort || '',
      }));
      
      console.log('Formatted jobs:', formattedJobs);
      setJobs(formattedJobs);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      setError('Failed to load jobs: ' + error.message);
    } finally {
      setIsLoadingJobs(false);
    }
  }, []);

  // Fetch shipments from Supabase
  const fetchShipments = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const mappedShipments = (data || []).map(shipment => ({
        id: shipment.id,
        shipmentNo: shipment.shipment_no || `${shipment.id.toString().padStart(6, '0')}`,
        client: shipment.client,
        jobNo: shipment.job_no || `${shipment.id.toString().padStart(6, '0')}`,
        por: shipment.por,
        pof: shipment.pof,
        createdAt: shipment.created_at ? new Date(shipment.created_at).toLocaleDateString() : '',
        updatedAt: shipment.updated_at ? new Date(shipment.updated_at).toLocaleDateString() : '',
        etd: shipment.etd ? new Date(shipment.etd).toLocaleDateString() : '',
        eta: shipment.eta ? new Date(shipment.eta).toLocaleDateString() : '',
        ...shipment
      }));
      
      setShipments(mappedShipments);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
  // When shipment type changes, clear the job selection if it doesn't match
  if (shipmentType && formData.jobNo) {
    const selectedJob = jobs.find(job => job.job_no === formData.jobNo);
    if (selectedJob && selectedJob.job_type !== shipmentType) {
      setFormData(prev => ({ ...prev, jobNo: '' }));
    }
  }
}, [shipmentType, jobs, formData.jobNo]);

  // Load jobs and shipments on component mount
  useEffect(() => {
    fetchJobs();
    fetchShipments();
  }, [fetchJobs, fetchShipments]);

  // Adjust max height when shipments change
  useEffect(() => {
    if (tableContainerRef.current) {
      const tableHeight = tableContainerRef.current.scrollHeight;
      const calculatedMaxHeight = Math.min(tableHeight, 400);
      setMaxHeight(`${calculatedMaxHeight}px`);
    }
  }, [shipments]);
const handleJobSelect = async (e) => {
  const selectedJobNo = e.target.value;
  setFormData((prev) => ({ ...prev, jobNo: selectedJobNo }));

  if (!selectedJobNo) return;

  try {
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("job_no", selectedJobNo)
      .single();

    if (error) {
      console.error("Error fetching job:", error.message);
      return;
    }

    if (data) {
      // Helper function to format date only (without time)
      const formatDateOnly = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toISOString().split('T')[0];
      };

      // Update the form with all job fields, mapping database fields to form fields
      setFormData((prev) => ({
        ...prev,
        // Common job fields
        branch: data.branch || prev.branch,
        department: data.department || prev.department,
        shipmentDate: formatDateOnly(data.job_date) || prev.shipmentDate,
        client: data.client || prev.client,
        shipper: data.shipper || prev.shipper,
        consignee: data.consignee || prev.consignee,
        address: data.address || prev.address,
        por: data.por || prev.por,
        pol: data.pol || prev.pol,
        pod: data.pod || prev.pod,
        pof: data.pof || prev.pof,
        hblNo: data.hbl_no || prev.hblNo,
         lclFcl: data.lcl_fcl || prev.lclFcl,
        // Use date-only formatting for ETD/ETA
        etd: formatDateOnly(data.etd) || prev.etd,
        eta: formatDateOnly(data.eta) || prev.eta,
        incoterms: data.incoterms || prev.incoterms,
        serviceType: data.service_type || prev.serviceType,
        freight: data.freight || prev.freight,
        payableAt: data.payable_at || prev.payableAt,
        dispatchAt: data.dispatch_at || prev.dispatchAt,
        tradeDirection: data.trade_direction || prev.tradeDirection,
        volume: data.volume || prev.volume,
        grossWeight: data.gross_weight || prev.grossWeight,
        description: data.description || prev.description,
        remarks: data.remarks || prev.remarks,
        hs_code: data.hs_code || prev.hs_code,

        // Air Freight-specific fields
        airport_of_departure: data.airport_of_departure || prev.airport_of_departure,
        airport_of_destination: data.airport_of_destination || prev.airport_of_destination,
        no_of_packages: data.no_of_packages || prev.no_of_packages,
        dimension_cms: data.dimension_cms || prev.dimension_cms,
        chargeable_weight: data.chargeable_weight || prev.chargeable_weight,
        client_no: data.client_no || prev.client_no,
        name_of_airline: data.name_of_airline || prev.name_of_airline,
        awb: data.awb || prev.awb,
        flight_from: data.flight_from || prev.flight_from,
        flight_to: data.flight_to || prev.flight_to,
        flight_eta: formatDateOnly(data.flight_eta) || prev.flight_eta,
        invoiceNo: data.invoice_no || prev.invoiceNo,
        invoiceDate: formatDateOnly(data.invoice_date) || prev.invoiceDate,
        notify_party: data.notify_party || prev.notify_party,

        // Sea Freight-specific fields
        exporter: data.exporter || prev.exporter,
        importer: data.importer || prev.importer,
        stuffingDate: formatDateOnly(data.stuffing_date) || prev.stuffingDate,
        hoDate: formatDateOnly(data.ho_date) || prev.hoDate,
        terms: data.terms || prev.terms,
        sbNo: data.sb_no || prev.sbNo,
        sbDate: formatDateOnly(data.sb_date) || prev.sbDate,
        destination: data.destination || prev.destination,
        commodity: data.commodity || prev.commodity,
        fob: data.fob || prev.fob,
        grWeight: data.gr_weight || prev.grWeight,
        netWeight: data.net_weight || prev.netWeight,
        railOutDate: formatDateOnly(data.rail_out_date) || prev.railOutDate,
        containerNo: data.container_no || prev.containerNo,
        noOfCntr: data.no_of_cntr || prev.noOfCntr,
        sLine: data.s_line || prev.sLine,
        mblNo: data.mbl_no || prev.mblNo,
        mblDate: formatDateOnly(data.mbl_date) || prev.mblDate,
        hblDt: formatDateOnly(data.hbl_dt) || prev.hblDt,
        vessel: data.vessel || prev.vessel,
        voy: data.voy || prev.voy,
        sob: data.sob || prev.sob,
        ac: data.ac || prev.ac,
        billNo: data.bill_no || prev.billNo,
        billDate: formatDateOnly(data.bill_date) || prev.billDate,
        ccPort: data.cc_port || prev.ccPort,
      }));
      
      // Set the shipment type based on the job type if not already set
      if (data.job_type && !shipmentType) {
        setShipmentType(data.job_type);
      }
    }
  } catch (err) {
    console.error("Unexpected error fetching job:", err);
  }
};

  // Validate current step before proceeding
  const validateStep = useCallback((step) => {
    const errors = {};
    const fieldsToValidate = requiredFields[step];
    
    if (step === 1) {
      if (!shipmentType) {
        errors.shipmentType = 'Shipment type is required';
      }
    } else {
      fieldsToValidate.forEach(field => {
        if (!formData[field] || formData[field].toString().trim() === '') {
          errors[field] = `${field} is required`;
        }
      });
    }
    
    setValidationErrors(errors);
    return true;
  }, [shipmentType, formData, requiredFields]);

  const handleNext = useCallback(() => {
    if (validateStep(activeStep)) {
      if (activeStep < STEPS.length) {
        setActiveStep(activeStep + 1);
      }
    }
  }, [activeStep, validateStep]);

  const handleBack = useCallback(() => {
    if (activeStep > 1) {
      setActiveStep(activeStep - 1);
    }
  }, [activeStep]);

  const handleCancel = useCallback(() => {
    setActiveStep(1);
    setShipmentType('');
    setShowShipmentForm(false);
    setEditingShipment(null);
    setValidationErrors({});
    setFormData(INITIAL_FORM_DATA);
  }, []);

  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation error for this field
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = {...prev};
        delete newErrors[name];
        return newErrors;
      });
    }
  }, [validationErrors]);

  const handleOrgInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setOrgFormData(prev => ({
      ...prev,
      [name]: value
    }));
  }, []);

  const handleShipmentTypeSelect = useCallback((type) => {
    setShipmentType(type);
    // Clear job selection when shipment type changes
    setFormData(prev => ({ ...prev, jobNo: '' }));
    if (validationErrors.shipmentType) {
      setValidationErrors(prev => {
        const newErrors = {...prev};
        delete newErrors.shipmentType;
        return newErrors;
      });
    }
  }, [validationErrors]);

  const handleCreateOrganization = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('organizations')
        .insert([orgFormData])
        .select();
      
      if (error) throw error;
      
      setFormData(prev => ({
        ...prev,
        client: data[0].name
      }));
      
      if (validationErrors.client) {
        setValidationErrors(prev => {
          const newErrors = {...prev};
          delete newErrors.client;
          return newErrors;
        });
      }
      
      setShowOrgModal(false);
      setSuccess('Organization created successfully!');
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [orgFormData, validationErrors]);

const handleConfirmShipment = useCallback(async () => {
  if (validateStep(activeStep)) {
    try {
      setLoading(true);
      
      // Helper function to handle empty date values
      const formatDateForDB = (dateValue) => {
        if (!dateValue || dateValue.toString().trim() === '') {
          return null;
        }
        return dateValue;
      };

      // Helper function to handle empty numeric values
      const formatNumericForDB = (numericValue) => {
        if (!numericValue || numericValue.toString().trim() === '') {
          return null;
        }
        // Convert to number
        const num = parseFloat(numericValue);
        return isNaN(num) ? null : num;
      };

      // Helper function to handle empty string values
      const formatStringForDB = (stringValue) => {
        if (!stringValue || stringValue.toString().trim() === '') {
          return null;
        }
        return stringValue;
      };

      const shipmentData = {
        branch: formatStringForDB(formData.branch),
        department: formatStringForDB(formData.department),
        shipment_date: formatDateForDB(formData.shipmentDate),
        client: formatStringForDB(formData.client),
        shipper: formatStringForDB(formData.shipper),
        consignee: formatStringForDB(formData.consignee),
        address: formatStringForDB(formData.address),
        por: formatStringForDB(formData.por),
        poi: formatStringForDB(formData.poi),
        pod: formatStringForDB(formData.pod),
        pof: formatStringForDB(formData.pof),
        hbl_no: formatStringForDB(formData.hblNo),
        job_no: formatStringForDB(formData.jobNo),
        etd: formatDateForDB(formData.etd),
        eta: formatDateForDB(formData.eta),
         lcl_fcl: formatStringForDB(formData.lclFcl),
        incoterms: formatStringForDB(formData.incoterms),
        service_type: formatStringForDB(formData.serviceType),
        freight: formatStringForDB(formData.freight),
        payable_at: formatStringForDB(formData.payableAt),
        dispatch_at: formatStringForDB(formData.dispatchAt),
        hs_code: formatStringForDB(formData.HSCode),
        pol: formatStringForDB(formData.pol),
        pdf: formatStringForDB(formData.pdf),
        carrier: formatStringForDB(formData.carrier),
        vessel_name_summary: formatStringForDB(formData.vesselNameSummary),
        no_of_res: formatNumericForDB(formData.noOfRes),
        volume: formatNumericForDB(formData.volume),
        gross_weight: formatNumericForDB(formData.grossWeight),
        description: formatStringForDB(formData.description),
        remarks: formatStringForDB(formData.remarks),
        shipment_type: shipmentType,
        trade_direction: formatStringForDB(formData.tradeDirection),
        updated_at: new Date().toISOString(),
        
        // Air Freight fields - handle dates and numbers
        airport_of_departure: formatStringForDB(formData.airport_of_departure),
        airport_of_destination: formatStringForDB(formData.airport_of_destination),
        no_of_packages: formatNumericForDB(formData.no_of_packages),
        dimension_cms: formatStringForDB(formData.dimension_cms),
        chargeable_weight: formatNumericForDB(formData.chargeable_weight),
        client_no: formatStringForDB(formData.client_no),
        name_of_airline: formatStringForDB(formData.name_of_airline),
        awb: formatStringForDB(formData.awb),
        flight_from: formatStringForDB(formData.flight_from),
        flight_to: formatStringForDB(formData.flight_to),
        flight_eta: formatDateForDB(formData.flight_eta),
        invoiceNo: formatStringForDB(formData.invoiceNo),
        invoiceDate: formatDateForDB(formData.invoiceDate),
        notify_party: formatStringForDB(formData.notify_party),
        
        // Sea Freight fields - handle dates and numbers
        exporter: formatStringForDB(formData.exporter),
        importer: formatStringForDB(formData.importer),
        stuffingDate: formatDateForDB(formData.stuffingDate),
        hoDate: formatDateForDB(formData.hoDate),
        terms: formatStringForDB(formData.terms),
        sbNo: formatStringForDB(formData.sbNo),
        sbDate: formatDateForDB(formData.sbDate),
        destination: formatStringForDB(formData.destination),
        commodity: formatStringForDB(formData.commodity),
        fob: formatStringForDB(formData.fob),
        grWeight: formatNumericForDB(formData.grWeight),
        netWeight: formatNumericForDB(formData.netWeight),
        railOutDate: formatDateForDB(formData.railOutDate),
        containerNo: formatStringForDB(formData.containerNo),
        noOfCntr: formatNumericForDB(formData.noOfCntr),
        sLine: formatStringForDB(formData.sLine),
        mblNo: formatStringForDB(formData.mblNo),
        mblDate: formatDateForDB(formData.mblDate),
        hblDt: formatDateForDB(formData.hblDt),
        vessel: formatStringForDB(formData.vessel),
        voy: formatStringForDB(formData.voy),
        sob: formatStringForDB(formData.sob),
        ac: formatStringForDB(formData.ac),
        billNo: formatStringForDB(formData.billNo),
        billDate: formatDateForDB(formData.billDate),
        ccPort: formatStringForDB(formData.ccPort),
      };
      
      // Remove null values to avoid sending empty fields
      const cleanShipmentData = Object.fromEntries(
        Object.entries(shipmentData).filter(([_, value]) => value !== null && value !== undefined)
      );
      
      let result;
      if (editingShipment) {
        const { data: updatedShipment, error } = await supabase
          .from('shipments')
          .update(cleanShipmentData)
          .eq('id', editingShipment.id)
          .select();
        
        if (error) throw error;
        result = updatedShipment;
      } else {
        const { data: newShipment, error } = await supabase
          .from('shipments')
          .insert([cleanShipmentData])
          .select();
        
        if (error) throw error;
        result = newShipment;
      }
      
      setPdfShipmentData({
        ...cleanShipmentData,
        shipmentNo: editingShipment ? editingShipment.shipmentNo : `MTD-${result?.[0]?.id?.toString().padStart(6, '0') || 'DOCUMENT'}`,
      });
      
      setGeneratePDF(true);
      handleCancel();
      setSuccess(editingShipment ? 'Shipment updated successfully!' : 'Shipment created successfully!');
      fetchShipments();
    } catch (error) {
      console.error('Error saving shipment:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
}, [formData, shipmentType, editingShipment, activeStep, validateStep, handleCancel, fetchShipments]);
  // Handle edit shipment
  const handleEditShipment = useCallback((shipment) => {
    setEditingShipment(shipment);
    setShipmentType(shipment.shipment_type);
    
    const formDataFromShipment = {
      branch: shipment.branch,
      department: shipment.department,
      shipmentDate: shipment.shipment_date,
      client: shipment.client,
      shipper: shipment.shipper,
       lclFcl: shipment.lcl_fcl,
      consignee: shipment.consignee,
      address: shipment.address,
      por: shipment.por,
      poi: shipment.poi,
      pod: shipment.pod,
      pof: shipment.pof,
      hblNo: shipment.hbl_no,
      jobNo: shipment.job_no,
      etd: shipment.etd,
      eta: shipment.eta,
      incoterms: shipment.incoterms,
      serviceType: shipment.service_type,
      freight: shipment.freight,
      payableAt: shipment.payable_at,
      dispatchAt: shipment.dispatch_at,
      HSCode: shipment.hs_code,
      pol: shipment.pol,
      pdf: shipment.pdf,
      carrier: shipment.carrier,
      vesselNameSummary: shipment.vessel_name_summary,
      noOfRes: shipment.no_of_res,
      volume: shipment.volume,
      grossWeight: shipment.gross_weight,
      description: shipment.description,
      remarks: shipment.remarks,
      tradeDirection: shipment.trade_direction || 'EXPORT',
      
      // Air Freight fields
      airport_of_departure: shipment.airport_of_departure,
      airport_of_destination: shipment.airport_of_destination,
      no_of_packages: shipment.no_of_packages,
      dimension_cms: shipment.dimension_cms,
      chargeable_weight: shipment.chargeable_weight,
      client_no: shipment.client_no,
      name_of_airline: shipment.name_of_airline,
      awb: shipment.awb,
      flight_from: shipment.flight_from,
      flight_to: shipment.flight_to,
      flight_eta: shipment.flight_eta,
      invoiceNo: shipment.invoiceNo,
      invoiceDate: shipment.invoiceDate,
      notify_party: shipment.notify_party,
      
      // Sea Freight fields
      exporter: shipment.exporter,
      importer: shipment.importer,
      stuffingDate: shipment.stuffingDate,
      hoDate: shipment.hoDate,
      terms: shipment.terms,
      sbNo: shipment.sbNo,
      sbDate: shipment.sbDate,
      destination: shipment.destination,
      commodity: shipment.commodity,
      fob: shipment.fob,
      grWeight: shipment.grWeight,
      netWeight: shipment.netWeight,
      railOutDate: shipment.railOutDate,
      containerNo: shipment.containerNo,
      noOfCntr: shipment.noOfCntr,
      sLine: shipment.sLine,
      mblNo: shipment.mblNo,
      mblDate: shipment.mblDate,
      hblDt: shipment.hblDt,
      vessel: shipment.vessel,
      voy: shipment.voy,
      sob: shipment.sob,
      ac: shipment.ac,
      billNo: shipment.billNo,
      billDate: shipment.billDate,
      ccPort: shipment.ccPort,
    };
    
    setFormData(formDataFromShipment);
    setShowShipmentForm(true);
    setActiveStep(2);
  }, []);

  // Handle delete shipment
  const handleDeleteShipment = useCallback(async () => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('shipments')
        .delete()
        .eq('id', shipmentToDelete.id);
      
      if (error) throw error;
      
      setShowDeleteModal(false);
      setShipmentToDelete(null);
      setSuccess('Shipment deleted successfully!');
      fetchShipments();
    } catch (error) {
      console.error('Error deleting shipment:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [shipmentToDelete, fetchShipments]);

  // Confirm delete
  const confirmDelete = useCallback((shipment) => {
    setShipmentToDelete(shipment);
    setShowDeleteModal(true);
  }, []);

  // Render specific fields based on shipment type and trade direction
  const renderSpecificFields = () => {
    if (!shipmentType) return null;
    
    if (shipmentType === 'AIR FREIGHT') {
      return (
        <div className="specific-fields-section">
          <h3>Air Freight Details - {formData.tradeDirection}</h3>
          <div className="form-grid-two-column">
            {[
              { label: 'Airport of Departure', name: 'airport_of_departure', type: 'text' },
              { label: 'Airport of Destination', name: 'airport_of_destination', type: 'text' },
              { label: 'No of Packages', name: 'no_of_packages', type: 'number' },
              { label: 'Dimension (CMS)', name: 'dimension_cms', type: 'text' },
              { label: 'Chargeable Weight', name: 'chargeable_weight', type: 'number' },
              { label: 'Client No', name: 'client_no', type: 'text' },
              { label: 'Name of Airline', name: 'name_of_airline', type: 'text' },
              { label: 'AWB', name: 'awb', type: 'text' },
              { label: 'Flight From', name: 'flight_from', type: 'text' },
              { label: 'Flight To', name: 'flight_to', type: 'text' },
              { label: 'Flight ETA', name: 'flight_eta', type: 'date' },
              { label: 'Invoice No', name: 'invoiceNo', type: 'text' },
              { label: 'Invoice Date', name: 'invoiceDate', type: 'date' },
              { label: 'Notify Party', name: 'notify_party', type: 'text' },
            ].map((field, index) => (
              <div key={index} className="form-group">
                <label>{field.label}</label>
                <input 
                  type={field.type}
                  name={field.name}
                  value={formData[field.name]}
                  onChange={handleInputChange}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }
    // In the renderSpecificFields function, add this condition
if (shipmentType === 'TRANSPORT') {
  return (
    <div className="specific-fields-section">
      <h3>Land Freight Details - {formData.tradeDirection}</h3>
      <div className="form-grid-two-column">
        <div className="form-group">
          <label>LCL/FCL <span className="required">*</span></label>
          <select 
            name="lclFcl"
            value={formData.lclFcl}
            onChange={handleInputChange}
          >
            <option value="">Select Option</option>
            <option value="LCL">LCL (Less than Container Load)</option>
            <option value="FCL">FCL (Full Container Load)</option>
          </select>
        </div>
        {/* Add other land-specific fields as needed */}
      </div>
    </div>
  );
}
    
    if (shipmentType === 'SEA FREIGHT') {
      return (
        <div className="specific-fields-section">
          <h3>Sea Freight Details - {formData.tradeDirection}</h3>
          <div className="form-grid-two-column">
            {[
              { label: 'Exporter', name: 'exporter', type: 'text', condition: formData.tradeDirection === 'EXPORT' },
              { label: 'Importer', name: 'importer', type: 'text', condition: formData.tradeDirection === 'IMPORT' },
              { label: 'Invoice No', name: 'invoiceNo', type: 'text', condition: true },
              { label: 'Invoice Date', name: 'invoiceDate', type: 'date', condition: true },
              { label: 'Stuffing Date', name: 'stuffingDate', type: 'date', condition: true },
              { label: 'H/O Date', name: 'hoDate', type: 'date', condition: true },
              { label: 'Terms', name: 'terms', type: 'text', condition: true },
              { label: 'S/B No', name: 'sbNo', type: 'text', condition: true },
              { label: 'S/B Date', name: 'sbDate', type: 'date', condition: true },
              { label: 'Destination', name: 'destination', type: 'text', condition: true },
              { label: 'Commodity', name: 'commodity', type: 'text', condition: true },
              { label: 'FOB', name: 'fob', type: 'text', condition: true },
              { label: 'GR Weight', name: 'grWeight', type: 'number', condition: true },
              { label: 'Net Weight', name: 'netWeight', type: 'number', condition: true },
              { label: 'RAIL Out Date', name: 'railOutDate', type: 'date', condition: true },
              { label: 'Container No', name: 'containerNo', type: 'text', condition: true },
              { label: 'No of CNTR', name: 'noOfCntr', type: 'number', condition: true },
              { label: 'S/Line', name: 'sLine', type: 'text', condition: true },
              { label: 'MBL No', name: 'mblNo', type: 'text', condition: true },
              { label: 'MBL Date', name: 'mblDate', type: 'date', condition: true },
              { label: 'HBL DT', name: 'hblDt', type: 'date', condition: true },
              { label: 'VESSEL', name: 'vessel', type: 'text', condition: true },
              { label: 'VOY', name: 'voy', type: 'text', condition: true },
              { label: 'SOB', name: 'sob', type: 'text', condition: true },
              { label: 'A/C', name: 'ac', type: 'text', condition: true },
              { label: 'Bill No', name: 'billNo', type: 'text', condition: true },
              { label: 'Bill Date', name: 'billDate', type: 'date', condition: true },
              { label: 'C/C Port', name: 'ccPort', type: 'text', condition: true },
            ].map((field, index) => 
              field.condition ? (
                <div key={index} className="form-group">
                  <label>{field.label}</label>
                  <input 
                    type={field.type}
                    name={field.name}
                    value={formData[field.name]}
                    onChange={handleInputChange}
                  />
                </div>
              ) : null
            )}
          </div>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="new-shipment-container">
      {generatePDF && pdfShipmentData && (
        <div style={{ textAlign: 'center', margin: '20px 0', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
          <Suspense fallback={<div>Loading PDF generator...</div>}>
            <PDFDownloadLink
              document={<PDFGenerator shipmentData={pdfShipmentData} />}
              fileName={`${pdfShipmentData.shipmentNo}.pdf`}
            >
              {({ blob, url, loading, error }) => {
                if (blob && !loading && handlePDFReady) {
                  handlePDFReady(blob);
                }
                return loading ? 'Generating PDF...' : 'Download PDF Document';
              }}
            </PDFDownloadLink>
          </Suspense>
          <button
            onClick={() => setGeneratePDF(false)}
            style={{ marginLeft: '10px', padding: '5px 10px' }}
          >
            Close
          </button>
        </div>
      )}
      
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner">Loading...</div>
        </div>
      )}

      {error && (
        <div className="error-message">
          Error: {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {success && (
        <div className="success-message">
          {success}
          <button onClick={() => setSuccess(false)}>Dismiss</button>
        </div>
      )}
      
      {/* Shipment List View */}
     <div className="card expandable-card">
  <div className="table-header">
    <h2>Current Shipments</h2>
    <button className="add-shipment-btn" onClick={() => setShowShipmentForm(true)}>
      <span className="plus-icon">+</span>
      Add Shipment
    </button>
  </div>
  <div
    className="table-container"
    ref={tableContainerRef}
    style={{ maxHeight: maxHeight, overflowY: 'auto' }}
  >
    <table className="activity-table">
      <thead>
        <tr>
          <th>Shipment No.</th>
          <th>Client</th>
          <th>Job No.</th>
          <th>POR</th>
          <th>POF</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {shipments.length > 0 ? (
          shipments.map((shipment, index) => (
            <tr key={index}>
              <td>{shipment.shipmentNo}</td>
              <td>{shipment.client}</td>
              <td>{shipment.jobNo}</td>
              <td>{shipment.por}</td>
              <td>{shipment.pof}</td>
              <td className="actions-cell">
                <button 
                  className="edit-btn"
                  onClick={() => handleEditShipment(shipment)}
                  title="Edit Shipment"
                >
                  Edit
                </button>
                <button 
                  className="delete-btn"
                  onClick={() => confirmDelete(shipment)}
                  title="Delete Shipment"
                >
                  Delete
                </button>
                <Suspense fallback={<span>Loading PDF...</span>}>
                  <PDFDownloadLink
                    document={<PDFGenerator shipmentData={shipment} />}
                    fileName={`${shipment.shipmentNo}.pdf`}
                    className="pdf-download-btn"
                    title="Download PDF"
                  >
                    {({ loading }) => loading ? 'Generating...' : 'PDF'}
                  </PDFDownloadLink>
                </Suspense>
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan="6" style={{textAlign: 'center', padding: '20px'}}>
              No shipments found
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</div>
      {/* Shipment Creation/Edit Form Modal */}
      {showShipmentForm && (
        <div className="modal-overlay">
          <div className="modal-content job-modal">
            <div className="new-shipment-card">
              <div className="new-shipment-header">
                <h1>{editingShipment ? 'Edit Shipment' : 'Create Shipment'}</h1>
              </div>

              {/* Progress Steps */}
              <div className="progress-steps">
                {STEPS.map((step, index) => (
                  <div 
                    key={index} 
                    className={`step ${index + 1 === activeStep ? 'active' : ''} ${index + 1 < activeStep ? 'completed' : ''}`}
                  >
                    <div className="step-number">{index + 1}</div>
                    <div className="step-label">{step}</div>
                  </div>
                ))}
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${((activeStep - 1) / (STEPS.length - 1)) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Step Content */}
              <div className="step-content">
                {activeStep === 1 && (
                  <div className="shipment-type-selection">
                    <h2>What type of Shipment would you like to {editingShipment ? 'edit' : 'create'}?</h2>
                    {validationErrors.shipmentType && (
                      <div className="validation-error">{validationErrors.shipmentType}</div>
                    )}
                    <div className="shipment-type-grid">
                      {SHIPMENT_TYPES.map((type, index) => (
                        <div 
                          key={index} 
                          className={`shipment-type-card ${shipmentType === type ? 'selected' : ''}`}
                          onClick={() => handleShipmentTypeSelect(type)}
                        >
                          {type}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeStep === 2 && (
                  <div className="port-details-form">
                    <h2>Port Details</h2>
                    
                    {/* Trade Direction Selection */}
                    {shipmentType && TRADE_DIRECTIONS[shipmentType] && (
                      <div className="form-group">
                        <label>Trade Direction <span className="required">*</span></label>
                        <select 
                          name="tradeDirection"
                          value={formData.tradeDirection}
                          onChange={handleInputChange}
                        >
                          {TRADE_DIRECTIONS[shipmentType].map((direction, index) => (
                            <option key={index} value={direction}>{direction}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    <div className="form-grid-two-column">
                      <div className="form-group">
                        <label>Branch <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="branch"
                          value={formData.branch}
                          onChange={handleInputChange}
                          className={validationErrors.branch ? 'error' : ''}
                        />
                        {validationErrors.branch && <span className="field-error">{validationErrors.branch}</span>}
                      </div>
                      <div className="form-group">
                        <label>Department <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="department"
                          value={formData.department}
                          onChange={handleInputChange}
                          className={validationErrors.department ? 'error' : ''}
                        />
                        {validationErrors.department && <span className="field-error">{validationErrors.department}</span>}
                      </div>
                      <div className="form-group">
                        <label>Shipment Date <span className="required">*</span></label>
                        <input 
                          type="date" 
                          name="shipmentDate"
                          value={formData.shipmentDate}
                          onChange={handleInputChange}
                          className={validationErrors.shipmentDate ? 'error' : ''}
                        />
                        {validationErrors.shipmentDate && <span className="field-error">{validationErrors.shipmentDate}</span>}
                      </div>
                      <div className="form-group with-button">
                        <label>Client <span className="required">*</span></label>
                        <div className="input-with-button">
                          <input 
                            type="text" 
                            name="client"
                            value={formData.client}
                            onChange={handleInputChange}
                            className={validationErrors.client ? 'error' : ''}
                          />
                          <button 
                            className="add-button"
                            onClick={() => setShowOrgModal(true)}
                          >
                            +
                          </button>
                        </div>
                        {validationErrors.client && <span className="field-error">{validationErrors.client}</span>}
                      </div>
                      <div className="form-group">
                        <label>Shipper <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="shipper"
                          value={formData.shipper}
                          onChange={handleInputChange}
                          className={validationErrors.shipper ? 'error' : ''}
                        />
                        {validationErrors.shipper && <span className="field-error">{validationErrors.shipper}</span>}
                      </div>
                      <div className="form-group">
                        <label>Consignee <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="consignee"
                          value={formData.consignee}
                          onChange={handleInputChange}
                          className={validationErrors.consignee ? 'error' : ''}
                        />
                        {validationErrors.consignee && <span className="field-error">{validationErrors.consignee}</span>}
                      </div>
                      <div className="form-group full-width">
                        <label>Address</label>
                        <input 
                          type="text" 
                          name="address"
                          value={formData.address}
                          onChange={handleInputChange}
                        />
                      </div>
                      <div className="form-group">
                        <label>POR <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="por"
                          value={formData.por}
                          onChange={handleInputChange}
                          className={validationErrors.por ? 'error' : ''}
                        />
                        {validationErrors.por && <span className="field-error">{validationErrors.por}</span>}
                      </div>
                      <div className="form-group">
                        <label>POL <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="pol"
                          value={formData.pol}
                          onChange={handleInputChange}
                          className={validationErrors.pol ? 'error' : ''}
                        />
                        {validationErrors.pol && <span className="field-error">{validationErrors.pol}</span>}
                      </div>
                      <div className="form-group">
                        <label>POD <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="pod"
                          value={formData.pod}
                          onChange={handleInputChange}
                          className={validationErrors.pod ? 'error' : ''}
                        />
                        {validationErrors.pod && <span className="field-error">{validationErrors.pod}</span>}
                      </div>
                      <div className="form-group">
                        <label>POF <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="pof"
                          value={formData.pof}
                          onChange={handleInputChange}
                          className={validationErrors.pof ? 'error' : ''}
                        />
                        {validationErrors.pof && <span className="field-error">{validationErrors.pof}</span>}
                      </div>
                      <div className="form-group">
                        <label>HBL No. <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="hblNo"
                          value={formData.hblNo}
                          onChange={handleInputChange}
                          className={validationErrors.hblNo ? 'error' : ''}
                        />
                        {validationErrors.hblNo && <span className="field-error">{validationErrors.hblNo}</span>}
                      </div>
                      <div className="form-group">
  <label>Job No. <span className="required">*</span></label>
  <select 
    name="jobNo"
    value={formData.jobNo}
    onChange={handleJobSelect}
    className={validationErrors.jobNo ? 'error' : ''}
  >
    <option value="">Select a Job</option>
    {isLoadingJobs ? (
      <option value="" disabled>Loading jobs...</option>
    ) : (
      // Filter jobs by selected shipment type
      jobs
        .filter(job => !shipmentType || job.job_type === shipmentType)
        .map((job) => (
          <option key={job.id} value={job.job_no}>
            {job.job_no} - {job.client || 'No Client'} ({job.job_type || 'No Type'})
          </option>
        ))
    )}
  </select>
  {validationErrors.jobNo && <span className="field-error">{validationErrors.jobNo}</span>}
</div>
                      <div className="form-group">
                        <label>ETD <span className="required">*</span></label>
                        <input 
                          type="date" 
                          name="etd"
                          value={formData.etd}
                          onChange={handleInputChange}
                          className={validationErrors.etd ? 'error' : ''}
                        />
                        {validationErrors.etd && <span className="field-error">{validationErrors.etd}</span>}
                      </div>
                      <div className="form-group">
                        <label>ETA <span className="required">*</span></label>
                        <input 
                          type="date" 
                          name="eta"
                          value={formData.eta}
                          onChange={handleInputChange}
                          className={validationErrors.eta ? 'error' : ''}
                        />
                        {validationErrors.eta && <span className="field-error">{validationErrors.eta}</span>}
                      </div>
                      <div className="form-group">
                        <label>INCOTERMS <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="incoterms"
                          value={formData.incoterms}
                          onChange={handleInputChange}
                          className={validationErrors.incoterms ? 'error' : ''}
                        />
                        {validationErrors.incoterms && <span className="field-error">{validationErrors.incoterms}</span>}
                      </div>
                      <div className="form-group">
                        <label>Service Type <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="serviceType"
                          value={formData.serviceType}
                          onChange={handleInputChange}
                          className={validationErrors.serviceType ? 'error' : ''}
                        />
                        {validationErrors.serviceType && <span className="field-error">{validationErrors.serviceType}</span>}
                      </div>
                      <div className="form-group">
                        <label>Freight <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="freight"
                          value={formData.freight}
                          onChange={handleInputChange}
                          className={validationErrors.freight ? 'error' : ''}
                        />
                        {validationErrors.freight && <span className="field-error">{validationErrors.freight}</span>}
                      </div>
                      <div className="form-group">
                        <label>Payable At <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="payableAt"
                          value={formData.payableAt}
                          onChange={handleInputChange}
                          className={validationErrors.payableAt ? 'error' : ''}
                        />
                        {validationErrors.payableAt && <span className="field-error">{validationErrors.payableAt}</span>}
                      </div>
                      <div className="form-group">
                        <label>Dispatch At <span className="required">*</span></label>
                        <input 
                          type="text" 
                          name="dispatchAt"
                          value={formData.dispatchAt}
                          onChange={handleInputChange}
                          className={validationErrors.dispatchAt ? 'error' : ''}
                        />
                        {validationErrors.dispatchAt && <span className="field-error">{validationErrors.dispatchAt}</span>}
                      </div>
                    </div>
                    
                    {/* Render specific fields based on shipment type */}
                    {renderSpecificFields()}
                    
                    <div className="client-os-info">
                      Client O/S: Credit Term: CASH | Total O/S: 46000 | Over Due O/S: 46000
                    </div>
                  </div>
                )}

                {activeStep === 3 && (
  <div className="summary-step">
    <h2>Summary</h2>
    
    <div className="client-branch-section">
      <div className="client-info">
        <span className="label">Client</span>
        <span className="value">{formData.client}</span>
      </div>
      <div className="branch-info">
        <span className="label">Branch</span>
        <span className="value">{formData.branch}</span>
      </div>
      <div className="department-info">
        <span className="label">Department</span>
        <span className="value">{formData.department}</span>
      </div>
      <div className="shipment-type-info">
        <span className="label">Shipment Type</span>
        <span className="value">{shipmentType}</span>
      </div>
      <div className="trade-direction-info">
        <span className="label">Trade Direction</span>
        <span className="value">{formData.tradeDirection}</span>
      </div>
    </div>

    <div className="divider"></div>

    <div className="parties-section">
      <h3>Parties Information</h3>
      <div className="summary-grid">
        <div className="summary-row">
          <span className="label">Shipper:</span>
          <span className="value">{formData.shipper}</span>
        </div>
        <div className="summary-row">
          <span className="label">Consignee:</span>
          <span className="value">{formData.consignee}</span>
        </div>
        <div className="summary-row">
          <span className="label">Notify Party:</span>
          <span className="value">{formData.notify_party}</span>
        </div>
        <div className="summary-row full-width">
          <span className="label">Address:</span>
          <span className="value">{formData.address}</span>
        </div>
      </div>
    </div>

    <div className="divider"></div>

    <div className="booking-info-section">
      <h3>Booking Information</h3>
      <div className="summary-grid">
        <div className="summary-row">
          <span className="label">POR:</span>
          <span className="value">{formData.por}</span>
          <span className="label">POL:</span>
          <span className="value">{formData.pol}</span>
        </div>
        <div className="summary-row">
          <span className="label">POD:</span>
          <span className="value">{formData.pod}</span>
          <span className="label">POF:</span>
          <span className="value">{formData.pof}</span>
        </div>
        <div className="summary-row">
          <span className="label">POI:</span>
          <span className="value">{formData.poi}</span>
          <span className="label">PDF:</span>
          <span className="value">{formData.pdf}</span>
        </div>
        <div className="summary-row">
          <span className="label">ETD:</span>
          <span className="value">{formData.etd}</span>
          <span className="label">ETA:</span>
          <span className="value">{formData.eta}</span>
        </div>
        <div className="summary-row">
          <span className="label">Shipment Date:</span>
          <span className="value">{formData.shipmentDate}</span>
          <span className="label">INCO Terms:</span>
          <span className="value">{formData.incoterms}</span>
        </div>
        <div className="summary-row">
          <span className="label">Service Type:</span>
          <span className="value">{formData.serviceType}</span>
          <span className="label">Freight:</span>
          <span className="value">{formData.freight}</span>
        </div>
        <div className="summary-row">
          <span className="label">Payable At:</span>
          <span className="value">{formData.payableAt}</span>
          <span className="label">Dispatch At:</span>
          <span className="value">{formData.dispatchAt}</span>
        </div>
        <div className="summary-row">
          <span className="label">Job No:</span>
          <span className="value">{formData.jobNo}</span>
          <span className="label">HBL No:</span>
          <span className="value">{formData.hblNo}</span>
        </div>
        <div className="summary-row">
          <span className="label">Carrier:</span>
          <span className="value">{formData.carrier}</span>
          <span className="label">HS Code:</span>
          <span className="value">{formData.HSCode}</span>
        </div>
        <div className="summary-row">
          <span className="label">No of Res:</span>
          <span className="value">{formData.noOfRes}</span>
          <span className="label">Volume:</span>
          <span className="value">{formData.volume}</span>
        </div>
        <div className="summary-row">
          <span className="label">Gross Weight:</span>
          <span className="value">{formData.grossWeight}</span>
        </div>
        <div className="summary-row full-width">
          <span className="label">Description:</span>
          <span className="value">{formData.description}</span>
        </div>
        <div className="summary-row full-width">
          <span className="label">Remarks:</span>
          <span className="value">{formData.remarks}</span>
        </div>
      </div>
    </div>

    {/* Air Freight Specific Fields */}
    {shipmentType === 'AIR FREIGHT' && (
      <>
        <div className="divider"></div>
        <div className="air-freight-section">
          <h3>Air Freight Details</h3>
          <div className="summary-grid">
            <div className="summary-row">
              <span className="label">Airport of Departure:</span>
              <span className="value">{formData.airport_of_departure}</span>
              <span className="label">Airport of Destination:</span>
              <span className="value">{formData.airport_of_destination}</span>
            </div>
            <div className="summary-row">
              <span className="label">No of Packages:</span>
              <span className="value">{formData.no_of_packages}</span>
              <span className="label">Dimension (CMS):</span>
              <span className="value">{formData.dimension_cms}</span>
            </div>
            <div className="summary-row">
              <span className="label">Chargeable Weight:</span>
              <span className="value">{formData.chargeable_weight}</span>
              <span className="label">Client No:</span>
              <span className="value">{formData.client_no}</span>
            </div>
            <div className="summary-row">
              <span className="label">Name of Airline:</span>
              <span className="value">{formData.name_of_airline}</span>
              <span className="label">AWB:</span>
              <span className="value">{formData.awb}</span>
            </div>
            <div className="summary-row">
              <span className="label">Flight From:</span>
              <span className="value">{formData.flight_from}</span>
              <span className="label">Flight To:</span>
              <span className="value">{formData.flight_to}</span>
            </div>
            <div className="summary-row">
              <span className="label">Flight ETA:</span>
              <span className="value">{formData.flight_eta}</span>
              <span className="label">Invoice No:</span>
              <span className="value">{formData.invoiceNo}</span>
            </div>
            <div className="summary-row">
              <span className="label">Invoice Date:</span>
              <span className="value">{formData.invoiceDate}</span>
            </div>
          </div>
        </div>
      </>
    )}
    // In the summary step, add this section after the sea freight section
{shipmentType === 'TRANSPORT' && (
  <>
    <div className="divider"></div>
    <div className="land-freight-section">
      <h3>Land Freight Details</h3>
      <div className="summary-grid">
        <div className="summary-row">
          <span className="label">LCL/FCL:</span>
          <span className="value">{formData.lclFcl}</span>
        </div>
        {/* Add other land-specific summary fields as needed */}
      </div>
    </div>
  </>
)}

    {/* Sea Freight Specific Fields */}
    {shipmentType === 'SEA FREIGHT' && (
      <>
        <div className="divider"></div>
        <div className="sea-freight-section">
          <h3>Sea Freight Details</h3>
          <div className="summary-grid">
            {formData.tradeDirection === 'EXPORT' && (
              <div className="summary-row">
                <span className="label">Exporter:</span>
                <span className="value">{formData.exporter}</span>
              </div>
            )}
            {formData.tradeDirection === 'IMPORT' && (
              <div className="summary-row">
                <span className="label">Importer:</span>
                <span className="value">{formData.importer}</span>
              </div>
            )}
            <div className="summary-row">
              <span className="label">Invoice No:</span>
              <span className="value">{formData.invoiceNo}</span>
              <span className="label">Invoice Date:</span>
              <span className="value">{formData.invoiceDate}</span>
            </div>
            <div className="summary-row">
              <span className="label">Stuffing Date:</span>
              <span className="value">{formData.stuffingDate}</span>
              <span className="label">H/O Date:</span>
              <span className="value">{formData.hoDate}</span>
            </div>
            <div className="summary-row">
              <span className="label">Terms:</span>
              <span className="value">{formData.terms}</span>
              <span className="label">S/B No:</span>
              <span className="value">{formData.sbNo}</span>
            </div>
            <div className="summary-row">
              <span className="label">S/B Date:</span>
              <span className="value">{formData.sbDate}</span>
              <span className="label">Destination:</span>
              <span className="value">{formData.destination}</span>
            </div>
            <div className="summary-row">
              <span className="label">Commodity:</span>
              <span className="value">{formData.commodity}</span>
              <span className="label">FOB:</span>
              <span className="value">{formData.fob}</span>
            </div>
            <div className="summary-row">
              <span className="label">GR Weight:</span>
              <span className="value">{formData.grWeight}</span>
              <span className="label">Net Weight:</span>
              <span className="value">{formData.netWeight}</span>
            </div>
            <div className="summary-row">
              <span className="label">RAIL Out Date:</span>
              <span className="value">{formData.railOutDate}</span>
              <span className="label">Container No:</span>
              <span className="value">{formData.containerNo}</span>
            </div>
            <div className="summary-row">
              <span className="label">No of CNTR:</span>
              <span className="value">{formData.noOfCntr}</span>
              <span className="label">S/Line:</span>
              <span className="value">{formData.sLine}</span>
            </div>
            <div className="summary-row">
              <span className="label">MBL No:</span>
              <span className="value">{formData.mblNo}</span>
              <span className="label">MBL Date:</span>
              <span className="value">{formData.mblDate}</span>
            </div>
            <div className="summary-row">
              <span className="label">HBL DT:</span>
              <span className="value">{formData.hblDt}</span>
              <span className="label">VESSEL:</span>
              <span className="value">{formData.vessel}</span>
            </div>
            <div className="summary-row">
              <span className="label">VOY:</span>
              <span className="value">{formData.voy}</span>
              <span className="label">SOB:</span>
              <span className="value">{formData.sob}</span>
            </div>
            <div className="summary-row">
              <span className="label">A/C:</span>
              <span className="value">{formData.ac}</span>
              <span className="label">Bill No:</span>
              <span className="value">{formData.billNo}</span>
            </div>
            <div className="summary-row">
              <span className="label">Bill Date:</span>
              <span className="value">{formData.billDate}</span>
              <span className="label">C/C Port:</span>
              <span className="value">{formData.ccPort}</span>
            </div>
          </div>
        </div>
      </>
    )}

    {/* Checkbox Section */}
    <div className="confirmation-checkboxes">
      <div className="checkbox-item">
        <input type="checkbox" id="confirm1" required />
        <label htmlFor="confirm1">I confirm the accuracy of all information</label>
      </div>
      <div className="checkbox-item">
        <input type="checkbox" id="confirm2" required />
        <label htmlFor="confirm2">I agree to the terms and conditions</label>
      </div>
      <div className="checkbox-item">
        <input type="checkbox" id="confirm3" required />
        <label htmlFor="confirm3">I authorize this shipment</label>
      </div>
    </div>

    <div className="confirmation-prompt">
      <p>Are you sure you want to {editingShipment ? 'update' : 'create'} the shipment?</p>
      <div className="confirmation-buttons">
        <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
        <button className="confirm-btn" onClick={handleConfirmShipment}>
          {editingShipment ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  </div>
)}
                
              </div>
              

              {/* Navigation Buttons */}
              <div className="navigation-buttons">
                <button className="cancel-button" onClick={handleCancel}>
                  X Cancel
                </button>
                <div className="step-buttons">
                  {activeStep > 1 && (
                    <button className="back-button" onClick={handleBack}>
                      Previous
                    </button>
                  )}
                  {activeStep < STEPS.length && (
                    <button className="next-button" onClick={handleNext}>
                      Next
                    </button>
                  )}
                  {activeStep === STEPS.length && (
                    <button className="confirm-button" onClick={handleConfirmShipment}>
                      {editingShipment ? 'Update Shipment' : 'Confirm & Create Shipment'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Organization Creation Modal */}
          {showOrgModal && (
            <div className="modal-overlay">
              <div className="modal-content org-modal">
                <div className="modal-header">
                  <h2>Create Organization</h2>
                  <button 
                    className="close-button"
                    onClick={() => setShowOrgModal(false)}
                  >
                    ×
                  </button>
                </div>
                
                <div className="modal-body org-modal-body">
                  <div className="org-form-container">
                    <div className="org-form-grid">
                      <div className="org-form-group">
                        <label>Name</label>
                        <input 
                          type="text" 
                          name="name"
                          value={orgFormData.name}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Record Status</label>
                        <select 
                          name="recordStatus"
                          value={orgFormData.recordStatus}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>
                      
                      <div className="org-form-group">
                        <label>Sales person</label>
                        <input 
                          type="text" 
                          name="salesPerson"
                          value={orgFormData.salesPerson}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Category List</label>
                        <select 
                          name="category"
                          value={orgFormData.category}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        >
                          {CATEGORIES.map((category, index) => (
                            <option key={index} value={category}>{category}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="org-form-group">
                        <label>Branch</label>
                        <input 
                          type="text" 
                          name="branch"
                          value={orgFormData.branch}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Contact Person</label>
                        <input 
                          type="text" 
                          name="contactPerson"
                          value={orgFormData.contactPerson}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Door No</label>
                        <input 
                          type="text" 
                          name="doorNo"
                          value={orgFormData.doorNo}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Building Name</label>
                        <input 
                          type="text" 
                          name="buildingName"
                          value={orgFormData.buildingName}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Street</label>
                        <input 
                          type="text" 
                          name="street"
                          value={orgFormData.street}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>Area</label>
                        <input 
                          type="text" 
                          name="area"
                          value={orgFormData.area}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>City</label>
                        <input 
                          type="text" 
                          name="city"
                          value={orgFormData.city}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                      
                      <div className="org-form-group">
                        <label>State</label>
                        <input 
                          type="text" 
                          name="state"
                          value={orgFormData.state}
                          onChange={handleOrgInputChange}
                          className="transparent-input"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="modal-footer org-modal-footer">
                  <button 
                    className="org-cancel-button"
                    onClick={() => setShowOrgModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    className="org-confirm-button"
                    onClick={handleCreateOrganization}
                  >
                    Create Organization
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-content delete-modal">
            <div className="modal-header">
              <h2>Confirm Delete</h2>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete shipment #{shipmentToDelete?.shipmentNo}?</p>
              <p>This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button 
                className="cancel-button"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button 
                className="delete-confirm-button"
                onClick={handleDeleteShipment}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewShipments;